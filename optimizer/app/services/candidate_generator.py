"""Deterministic candidate generation for the optimisation engine.

Implements the :class:`app.services.CandidateGenerator` interface.

What it does:

- derives an availability window for each task from the task's own window, a
  matching :class:`BlockRequest` in the context, or the planning horizon;
- resolves the block section from the matching request, the task's asset (in
  context), or ``task.metadata["section"]``;
- enumerates deterministic start times at ``settings.candidate_step_minutes``
  such that the task duration fits; when the window is too short for the full
  duration a single clamped candidate is kept so the shortfall is never lost;
- validates every candidate through the :class:`ConstraintEngine` and attaches
  structured rejection information to the candidate itself (rejected candidates
  are retained, never silently discarded).

What it does NOT do: priority scoring, scheduling, integrated-block creation,
ML predictions, randomness. Output order and content are fully deterministic
for identical inputs and configuration.

If a task carries no window, no matching request and no planning horizon, or its
section cannot be resolved, candidate generation fails loudly with a
``ValueError`` rather than fabricating timings or locations.
"""

from datetime import timedelta

from app.constraints.engine import ConstraintEngine
from app.core.config import Settings, get_settings
from app.core.context import PlanningContext
from app.services import CandidateGenerator as CandidateGeneratorInterface
from contracts import BlockCandidate, BlockRequest, ConstraintViolation, MaintenanceTask, ViolationSeverity


class CandidateGenerator(CandidateGeneratorInterface):
    """Generates deterministic, rejection-preserving block candidates."""

    def __init__(
        self,
        settings: Settings | None = None,
        constraint_engine: ConstraintEngine | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._engine = constraint_engine or ConstraintEngine(settings=self._settings)

    @property
    def settings(self) -> Settings:
        return self._settings

    @property
    def engine(self) -> ConstraintEngine:
        return self._engine

    def generate_candidates(
        self,
        tasks: list[MaintenanceTask],
        corridors,
        context: dict,
    ) -> list[BlockCandidate]:
        """Generate all candidates (feasible and rejected) in deterministic order."""
        raw = dict(context or {})
        if tasks:
            raw["tasks"] = tasks
        if corridors:
            raw["corridors"] = corridors
        ctx = PlanningContext.from_dict(raw)
        if not ctx.tasks:
            return []

        candidates: list[BlockCandidate] = []
        for task in sorted(ctx.tasks, key=lambda t: t.task_id):
            candidates.extend(self._candidates_for_task(task, ctx))
        candidates.sort(key=lambda c: c.candidate_id)

        validated: list[BlockCandidate] = []
        for candidate in candidates:
            violations = self._engine.validate(candidate, ctx.model_dump())
            rejected = any(v.severity == ViolationSeverity.ERROR for v in violations)
            validated.append(
                candidate.model_copy(
                    update={
                        "violations": violations,
                        "rejected": rejected,
                        "feasibility_score": 0.0 if rejected else 1.0,
                    }
                )
            )
        return validated

    @staticmethod
    def only_feasible(candidates: list[BlockCandidate]) -> list[BlockCandidate]:
        """Filter candidates that did not violate any hard constraint."""
        return [c for c in candidates if not c.rejected]

    # ----------------------------------------------------------- generation

    def _candidates_for_task(self, task: MaintenanceTask, ctx: PlanningContext) -> list[BlockCandidate]:
        corridor_id, section = self._resolve_location(task, ctx)
        window, window_source, request = self._resolve_window(task, ctx)
        duration = task.estimated_duration_minutes
        step = timedelta(minutes=self._settings.candidate_step_minutes)
        window_start, window_end = window

        starts: list = []
        cursor = window_start
        while cursor + timedelta(minutes=duration) <= window_end:
            starts.append(cursor)
            cursor += step
            if len(starts) >= self._settings.max_candidates_per_task:
                break

        candidates: list[BlockCandidate] = []
        if starts:
            for index, start in enumerate(starts):
                candidates.append(
                    self._build_candidate(
                        task, corridor_id, section, window, window_source, request,
                        start, start + timedelta(minutes=duration), duration, index,
                    )
                )
        else:
            end = min(window_end, window_start + timedelta(minutes=duration))
            candidates.append(
                self._build_candidate(
                    task, corridor_id, section, window, window_source, request,
                    window_start, end, duration, 0,
                )
            )
        return candidates

    def _build_candidate(
        self,
        task: MaintenanceTask,
        corridor_id: str,
        section: str,
        window: tuple,
        window_source: str,
        request: BlockRequest | None,
        start,
        end,
        duration: int,
        sequence: int,
    ) -> BlockCandidate:
        available_minutes = int((end - start).total_seconds() // 60)
        metadata = {
            "window_source": window_source,
            "base_window": [window[0].isoformat(), window[1].isoformat()],
            "required_duration_minutes": duration,
            "available_duration_minutes": available_minutes,
            "work_type": task.work_type.value,
            "priority": task.priority.value,
            "required_resources": sorted(task.required_resources),
        }
        if request is not None:
            metadata["request_id"] = request.request_id
        return BlockCandidate(
            candidate_id=f"{task.task_id}-c{sequence:03d}",
            task_ids=[task.task_id],
            corridor_id=corridor_id,
            section=section,
            start_time=start,
            end_time=end,
            total_duration_minutes=available_minutes,
            feasibility_score=1.0,
            source_request_id=request.request_id if request is not None else None,
            metadata=metadata,
        )

    # ------------------------------------------------------------- resolution

    def _resolve_window(
        self, task: MaintenanceTask, ctx: PlanningContext
    ) -> tuple[tuple, str, BlockRequest | None]:
        request = self._matching_request(task, ctx)
        if task.window_start is not None and task.window_end is not None:
            return (task.window_start, task.window_end), "task_window", request
        if request is not None:
            return (request.requested_start, request.requested_end), "block_request", request
        if ctx.horizon_start is not None and ctx.horizon_end is not None:
            return (ctx.horizon_start, ctx.horizon_end), "planning_horizon", None
        raise ValueError(
            f"no time window for task '{task.task_id}': set task.window_start/window_end, "
            "provide a matching BlockRequest in context, or supply context horizon_start/horizon_end"
        )

    def _resolve_location(self, task: MaintenanceTask, ctx: PlanningContext) -> tuple[str, str]:
        corridor_id = task.corridor_id
        request = self._matching_request(task, ctx)
        if request is not None and request.corridor_id == corridor_id:
            return corridor_id, request.section
        asset = next(
            (a for a in ctx.assets if a.asset_id == task.asset_id and a.corridor_id == corridor_id),
            None,
        )
        if asset is not None:
            return corridor_id, asset.section
        metadata_section = task.metadata.get("section")
        if metadata_section:
            return corridor_id, metadata_section
        raise ValueError(
            f"cannot resolve section for task '{task.task_id}' on corridor '{corridor_id}': "
            "no matching BlockRequest, asset in context, or task.metadata['section']"
        )

    @staticmethod
    def _matching_request(task: MaintenanceTask, ctx: PlanningContext) -> BlockRequest | None:
        for request in ctx.block_requests:
            if task.task_id in request.task_ids:
                return request
        return None


__all__ = ["CandidateGenerator"]