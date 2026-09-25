"""Deterministic schedule optimization with OR-Tools CP-SAT (Phase 3B).

Implements the :class:`app.services.ScheduleOptimizer` interface.

Pipeline consumed (outputs of Phase 2 + Phase 3A):

- :class:`CandidateGenerator` produces feasible single-task block candidates
  (engine-validated; rejected candidates preserved with codes);
- :class:`IntegratedBlockDetector` produces compatible integrated-block
  candidates (multi-task groups sharing one possession window).

The optimizer makes ONE deterministic selection decision: which candidates to
schedule. There are no per-minute variables, only Boolean selection variables
``x[candidate] ∈ {0,1}``; time is an integer count of minutes from a fixed
origin (``context.horizon_start``, or the earliest candidate start when the
context carries no horizon), so the model stays small and deterministic.

Hard constraints (never relaxed):

1. At most one candidate is selected per task. An integrated block covers every
   one of its member tasks, so selecting it blocks all competing singles and
   gives integrated-block consistency for free.
2. Tasks with ``PriorityLevel.URGENT`` that have at least one model candidate
   are MANDATORY (exactly one selected). If two mandatory placements conflict
   the model is INFEASIBLE - the solver will never silently drop urgent work.
3. Pairwise mutual exclusion for any two candidates whose possessions overlap
   in time AND (a) share the same corridor + section, or (b) share a resource
   with ``capacity == 1``. Capacity > 1 resource contention is future work
   (documented in the README).
4. Hard constraints already applied upstream by the ConstraintEngine (train
   movements, existing blocks, peak goods windows, asset protection) are never
   re-derived here; candidate feasibility is simply an input to the model.

Objective (maximised, all terms weighted by ``ObjectiveWeights`` and scaled to
integers with ``_SCALE``):

- ``task_completion`` per task covered by a selected candidate;
- ``priority_adherence`` per selected candidate, using the Module 2
  ``AIRecommendation.priority_score`` (0..100 normalised to 0..1) or a
  deterministic fallback map over ``PriorityLevel`` when no AI rec exists;
- ``overdue_reduction``: how overdue the work is relative to the planning
  horizon anchor (``context.horizon_start.date()`` - never ``date.today()``);
- ``slot_consolidation`` × (number of tasks - 1) for integrated blocks;
- ``resource_efficiency`` × utilization for each selected block (currently 1.0
  because feasible placements are tight possessions - documented);
- ``- forecast_alignment`` × a soft goods-train disruption penalty (reuses the
  configured thresholds; peak windows are already hard-ERROR so only the
  elevated band can contribute).

Solver behaviour:

- CP-SAT parameters: ``num_search_workers=1`` + ``random_seed=0`` and all
  variables/constraints/objective terms added in sorted order, so identical
  input + config yields an identical solution;
- status mapping (never labels FEASIBLE as OPTIMAL): OPTIMAL → OPTIMAL,
  FEASIBLE → FEASIBLE, INFEASIBLE → INFEASIBLE, MODEL_INVALID → ERROR,
  anything else → UNKNOWN;
- when the model has no solution (INFEASIBLE / UNKNOWN / ERROR) NO fake
  schedule is produced, all scoped tasks are reported unscheduled with reasons.

Scope: only the tasks referenced by ``request.task_ids`` are optimised; absent
ids in the request are a loud ERROR (input malformed), never a silent skip.
"""

import sys
import types as _types
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from app.core.config import Settings, get_settings
from app.core.context import PlanningContext
from app.services import ScheduleOptimizer as ScheduleOptimizerInterface
from app.services.candidate_generator import CandidateGenerator
from app.services.integrated_block_detector import IntegratedBlockDetector
from contracts import (
    BlockCandidate,
    BlockRequest,
    IntegratedBlockCandidate,
    MaintenanceTask,
    PriorityLevel,
    ScheduleBlock,
    ScheduleResult,
    TaskSchedulingInfo,
    ViolationSeverity,
)


class _PandasIndex:
    pass


class _PandasSeries:
    pass


class _PandasDataFrame:
    pass


def _ensure_cp_model():
    """Import ``ortools.sat.python.cp_model``, tolerating a host quirk.

    ``cp_model`` imports pandas at module import time, and on this host pandas'
    compiled DLLs are blocked by the Windows Application Control policy
    (``ImportError: DLL load failed ... blocked this file``). pandas is only
    used by cp_model for OPTIONAL DataFrame helpers that this engine never
    calls, so when real pandas cannot be imported we inject a minimal stub into
    ``sys.modules``. numpy is unaffected and imports normally.
    """
    try:
        import pandas  # noqa: F401
    except ImportError:
        stub = _types.ModuleType("pandas")
        stub.__version__ = "0.0.0-stub"
        stub.Index = _PandasIndex
        stub.Series = _PandasSeries
        stub.DataFrame = _PandasDataFrame
        sys.modules["pandas"] = stub
    from ortools.sat.python import cp_model

    return cp_model


cp_model = _ensure_cp_model()

# Objective scaling: CP-SAT requires integer coefficients/objective.
_SCALE = 100_000

# Deterministic fallback mapping over the existing PriorityLevel enum, used only
# when no Module 2 AIRecommendation exists for a task.
_PRIORITY_ENUM_SCORE = {
    PriorityLevel.URGENT.value: 1.0,
    PriorityLevel.HIGH.value: 0.75,
    PriorityLevel.MEDIUM.value: 0.5,
    PriorityLevel.LOW.value: 0.25,
}
_FALLBACK_PRIORITY_SCORE = 0.5

_STATUS_MESSAGES = {
    "OPTIMAL": "optimal schedule found",
    "FEASIBLE": "feasible schedule found (optimality not proven within timeout)",
    "INFEASIBLE": "no schedule satisfies all hard constraints",
    "ERROR": "model error",
    "UNKNOWN": "solver stopped without a solution",
}


@dataclass
class _Record:
    """One Boolean decision: schedule this candidate placement or not."""

    key: str
    label: str
    task_ids: tuple[str, ...]
    corridor_id: str
    section: str
    start: datetime
    end: datetime
    total_minutes: int
    kind: str  # "SINGLE" | "INTEGRATED"
    source_ids: tuple[str, ...]
    required_resources: tuple[str, ...]
    start_min: int = 0
    end_min: int = 0
    priority_sum: float = 0.0
    overdue_sum: float = 0.0
    utilization: float = 1.0
    disruption: float = 0.0


@dataclass
class _BuiltModel:
    cp: object
    records: list[_Record]
    var: dict[str, object]
    task_map: dict[str, list[str]]
    mandatory_tasks: list[str]
    obj_terms: dict[str, int]
    obj_scale: int = _SCALE


def _map_cp_status(cp_status: int) -> str:
    """Map a CP-SAT status int to the ScheduleResult status vocabulary.

    FEASIBLE is NEVER reported as OPTIMAL: the naming is 1-to-1 with CP-SAT.
    """
    if cp_status == cp_model.OPTIMAL:
        return "OPTIMAL"
    if cp_status == cp_model.FEASIBLE:
        return "FEASIBLE"
    if cp_status == cp_model.INFEASIBLE:
        return "INFEASIBLE"
    if cp_status == cp_model.MODEL_INVALID:
        return "ERROR"
    return "UNKNOWN"


class ScheduleOptimizer(ScheduleOptimizerInterface):
    """CP-SAT based deterministic block scheduling."""

    def __init__(
        self,
        settings: Settings | None = None,
        candidate_generator: CandidateGenerator | None = None,
        integrated_block_detector: IntegratedBlockDetector | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._generator = candidate_generator or CandidateGenerator(settings=self._settings)
        self._integrated_detector = integrated_block_detector or IntegratedBlockDetector(
            settings=self._settings
        )
        self._priority_source = "task_priority_fallback"

    @property
    def settings(self) -> Settings:
        return self._settings

    # -------------------------------------------------------- public contract

    def optimize(self, request: BlockRequest, context: dict) -> ScheduleResult:
        """Produce an optimized schedule for the given request."""
        try:
            return self._optimize(request, context)
        except (ValueError, TypeError) as exc:  # pydantic validation errors included
            return self._error_result(request, f"invalid scheduling input: {exc}")

    # ------------------------------------------------------------ core pipeline

    def _optimize(self, request: BlockRequest, context: dict) -> ScheduleResult:
        raw = dict(context or {})
        ctx = PlanningContext.from_dict(raw)

        if not ctx.tasks:
            return self._error_result(request, "planning context contains no tasks")

        context_task_ids = {task.task_id for task in ctx.tasks}
        scope_ids = list(dict.fromkeys(request.task_ids or sorted(context_task_ids)))
        missing = [task_id for task_id in scope_ids if task_id not in context_task_ids]
        if missing:
            return self._error_result(
                request, f"request references tasks absent from context: {sorted(missing)}"
            )

        in_scope = sorted(
            (task for task in ctx.tasks if task.task_id in scope_ids),
            key=lambda t: t.task_id,
        )
        self._priority_source = self._resolve_priority_source(in_scope, ctx)

        try:
            generated = self._generator.generate_candidates(in_scope, ctx.corridors, raw)
        except ValueError as exc:
            return self._error_result(request, f"candidate generation failed: {exc}")

        feasible = CandidateGenerator.only_feasible(generated)

        try:
            integrated = self._integrated_detector.detect(feasible, ctx.corridors, raw)
        except (ValueError, TypeError) as exc:
            return self._error_result(request, f"integrated block detection failed: {exc}")

        feasible_integrated = [
            block for block in integrated if block.compatible and block.window_start is not None
        ]

        if not feasible and not feasible_integrated:
            return self._unsolution_result(
                request, generated, scope_ids,
                status="UNKNOWN",
                message="no schedulable candidates: no feasible placement could be examined",
            )

        records = self._build_records(feasible, feasible_integrated, ctx)
        if not records:
            return self._unsolution_result(
                request, generated, scope_ids, status="UNKNOWN",
                message="no schedulable candidates could be represented in the model",
            )

        candidate_map = self._candidate_map(generated)
        built = self.build_model(records, ctx)
        solver, cp_status = self.solve(built.cp)
        return self.build_result(
            request=request,
            ctx=ctx,
            built=built,
            solver=solver,
            cp_status=cp_status,
            generated=generated,
            candidate_map=candidate_map,
            feasible=feasible,
            feasible_integrated=feasible_integrated,
            scope_ids=scope_ids,
        )

    # --------------------------------------------------------- model construction

    def build_model(self, records: list[_Record], ctx: PlanningContext) -> _BuiltModel:
        """Build the CP-SAT model: variables, hard constraints, objective."""
        model = cp_model.CpModel()
        records = list(records)
        records.sort(key=lambda r: r.key)

        origin = ctx.horizon_start or min(r.start for r in records)
        for record in records:
            record.start_min = int((record.start - origin).total_seconds() // 60)
            record.end_min = int((record.end - origin).total_seconds() // 60)

        var = {record.key: model.NewBoolVar(record.key) for record in records}

        task_map: dict[str, list[str]] = {}
        for record in records:
            for task_id in record.task_ids:
                task_map.setdefault(task_id, []).append(record.key)
        for keys in task_map.values():
            keys.sort()

        urgent_with_candidates = [
            task.task_id
            for task in ctx.tasks
            if task.priority == PriorityLevel.URGENT and task.task_id in task_map
        ]
        mandatory_tasks = sorted(urgent_with_candidates)

        self.add_hard_constraints(model, records, var, task_map, mandatory_tasks, ctx)
        terms = self._objective_terms(records, ctx)
        self.add_objective(model, records, var, terms)
        return _BuiltModel(
            cp=model,
            records=records,
            var=var,
            task_map=task_map,
            mandatory_tasks=mandatory_tasks,
            obj_terms=terms,
        )

    def add_hard_constraints(
        self,
        model,
        records: list[_Record],
        var: dict,
        task_map: dict[str, list[str]],
        mandatory_tasks: list[str],
        ctx: PlanningContext,
    ) -> None:
        """At-most-one per task; mandatory urgent exact-one; pair exclusion."""
        for task_id in sorted(task_map):
            keys = task_map[task_id]
            if task_id in mandatory_tasks:
                model.AddExactlyOne(var[key] for key in keys)
            else:
                model.Add(sum(var[key] for key in keys) <= 1)

        resource_capacity = {r.resource_id: r.capacity for r in ctx.resources}
        n = len(records)
        for i in range(n):
            for j in range(i + 1, n):
                a, b = records[i], records[j]
                if not (a.start_min < b.end_min and b.start_min < a.end_min):
                    continue
                same_location = a.corridor_id == b.corridor_id and a.section == b.section
                shared_resources = set(a.required_resources) & set(b.required_resources)
                shared_capacity_one = any(
                    resource_capacity.get(resource_id, 1) == 1
                    for resource_id in shared_resources
                )
                if same_location or shared_capacity_one:
                    model.Add(var[a.key] + var[b.key] <= 1)

    def add_objective(
        self,
        model,
        records: list[_Record],
        var: dict,
        terms: dict[str, int],
    ) -> None:
        """Maximise the integer-scaled sum of per-candidate contributions."""
        expression = 0
        for record in records:
            expression += terms[record.key] * var[record.key]
        model.Maximize(expression)

    def solve(self, model):
        """Solve with deterministic CP-SAT parameters; return (solver, status)."""
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self._settings.solver_timeout_seconds
        solver.parameters.random_seed = 0
        solver.parameters.num_search_workers = 1
        status = solver.Solve(model)
        return solver, status

    # --------------------------------------------------------------- result build

    def build_result(
        self,
        request: BlockRequest,
        ctx: PlanningContext,
        built: _BuiltModel,
        solver,
        cp_status: int,
        generated: list[BlockCandidate],
        candidate_map: dict[str, list[BlockCandidate]],
        feasible: list[BlockCandidate],
        feasible_integrated: list[IntegratedBlockCandidate],
        scope_ids: list[str],
    ) -> ScheduleResult:
        status = _map_cp_status(cp_status)
        solved = cp_status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        scaled_objective = int(solver.objective_value) if solved else 0

        records = built.records
        selected = (
            [record for record in records if solver.value(built.var[record.key]) == 1]
            if solved
            else []
        )
        scheduled_ids = sorted({task_id for record in selected for task_id in record.task_ids})
        unscheduled_ids = sorted(set(scope_ids) - set(scheduled_ids))

        blocks = [self._to_schedule_block(record, built.obj_terms) for record in selected]

        unscheduled_tasks = []
        for task_id in unscheduled_ids:
            reason = self._unscheduled_reason(task_id, status, candidate_map)
            info = self._task_info(task_id, candidate_map)
            unscheduled_tasks.append(
                TaskSchedulingInfo(
                    task_id=task_id,
                    scheduled=False,
                    reason=reason,
                    candidate_count=info["candidate_count"],
                    feasible_candidate_count=info["feasible_candidate_count"],
                    rejection_codes=info["rejection_codes"],
                    metadata={"solver_status": status},
                )
            )

        wall_time = float(solver.wall_time)
        timeout = float(self._settings.solver_timeout_seconds)
        metadata = {
            "solver": "ortools.cp_sat",
            "cp_sat_status": getattr(cp_status, "name", str(cp_status)),
            "solve_time_seconds": round(wall_time, 6),
            "timeout_seconds": timeout,
            "timed_out": wall_time >= timeout,
            "objective_value": round(scaled_objective / _SCALE, 6),
            "objective_scaled": scaled_objective,
            "selected_candidate_count": len(selected),
            "scheduled_task_count": len(scheduled_ids),
            "unscheduled_task_count": len(unscheduled_ids),
            "num_search_workers": 1,
            "random_seed": 0,
            "priority_source": self._priority_source,
            "candidates_generated": len(generated),
            "feasible_single_candidates": len(feasible),
            "integrated_candidates": len(feasible_integrated),
            "model_infeasible": status == "INFEASIBLE",
            "mandatory_urgent_tasks": list(built.mandatory_tasks),
        }

        return ScheduleResult(
            schedule_id=f"SCHED-{request.request_id}",
            status=status,
            message=_STATUS_MESSAGES.get(status, "unknown status"),
            selected_blocks=blocks,
            scheduled_task_ids=scheduled_ids,
            unscheduled_task_ids=unscheduled_ids,
            unscheduled_tasks=unscheduled_tasks,
            objective_value=round(scaled_objective / _SCALE, 6),
            solver_metadata=metadata,
        )

    def _to_schedule_block(self, record: _Record, terms: dict[str, int]) -> ScheduleBlock:
        return ScheduleBlock(
            block_id=record.label,
            task_ids=list(record.task_ids),
            corridor_id=record.corridor_id,
            section=record.section,
            start_time=record.start,
            end_time=record.end,
            block_type=record.kind,
            source_candidate_ids=list(record.source_ids),
            total_duration_minutes=record.total_minutes,
            objective_contribution=round(terms[record.key] / _SCALE, 6),
            metadata={
                "kind": record.kind,
                "priority_sum": round(record.priority_sum, 6),
                "overdue_sum": round(record.overdue_sum, 6),
                "utilization": round(record.utilization, 6),
                "goods_disruption_penalty": round(record.disruption, 6),
            },
        )

    # -------------------------------------------------------------- error / unknown

    def _unsolution_result(
        self,
        request: BlockRequest,
        generated: list[BlockCandidate],
        scope_ids: list[str],
        status: str,
        message: str,
    ) -> ScheduleResult:
        candidate_map = self._candidate_map(generated)
        infos = []
        for task_id in sorted(scope_ids):
            info = self._task_info(task_id, candidate_map)
            infos.append(
                TaskSchedulingInfo(
                    task_id=task_id,
                    scheduled=False,
                    reason=self._unscheduled_reason(task_id, status, candidate_map),
                    candidate_count=info["candidate_count"],
                    feasible_candidate_count=info["feasible_candidate_count"],
                    rejection_codes=info["rejection_codes"],
                    metadata={"solver_status": status, "no_solution": True},
                )
            )
        metadata = {
            "solver": "ortools.cp_sat",
            "cp_sat_status": None,
            "timeout_seconds": float(self._settings.solver_timeout_seconds),
            "timed_out": False,
            "objective_value": 0.0,
            "objective_scaled": 0,
            "selected_candidate_count": 0,
            "scheduled_task_count": 0,
            "unscheduled_task_count": len(infos),
            "num_search_workers": 1,
            "random_seed": 0,
            "priority_source": self._priority_source,
            "candidates_generated": len(generated),
            "model_infeasible": status == "INFEASIBLE",
        }
        return ScheduleResult(
            schedule_id=f"SCHED-{request.request_id}",
            status=status,
            message=message,
            unscheduled_task_ids=sorted(scope_ids),
            unscheduled_tasks=infos,
            solver_metadata=metadata,
        )

    def _error_result(self, request: BlockRequest, message: str) -> ScheduleResult:
        scope = sorted(set(request.task_ids or []))
        metadata = {
            "solver": "ortools.cp_sat",
            "cp_sat_status": None,
            "model_infeasible": False,
            "priority_source": self._priority_source,
        }
        return ScheduleResult(
            schedule_id=f"SCHED-{request.request_id}",
            status="ERROR",
            message=message,
            unscheduled_task_ids=scope,
            unscheduled_tasks=[
                TaskSchedulingInfo(
                    task_id=task_id,
                    scheduled=False,
                    reason="not schedulable: invalid input",
                    metadata={"solver_status": "ERROR"},
                )
                for task_id in scope
            ],
            solver_metadata=metadata,
        )

    # ---------------------------------------------------------------- per-task info

    @staticmethod
    def _candidate_map(generated: list[BlockCandidate]) -> dict[str, list[BlockCandidate]]:
        mapping: dict[str, list[BlockCandidate]] = {}
        for candidate in sorted(generated, key=lambda c: c.candidate_id):
            for task_id in candidate.task_ids:
                mapping.setdefault(task_id, []).append(candidate)
        for keys in mapping.values():
            keys.sort(key=lambda c: c.candidate_id)
        return mapping

    @staticmethod
    def _task_info(
        task_id: str, candidate_map: dict[str, list[BlockCandidate]]
    ) -> dict:
        candidates = candidate_map.get(task_id, [])
        rejected = [c for c in candidates if c.rejected]
        codes = sorted(
            {
                violation.violation_code
                for candidate in rejected
                for violation in candidate.violations
                if violation.severity == ViolationSeverity.ERROR
            }
        )
        return {
            "candidate_count": len(candidates),
            "feasible_candidate_count": len(candidates) - len(rejected),
            "rejection_codes": codes,
        }

    @staticmethod
    def _unscheduled_reason(
        task_id: str, status: str, candidate_map: dict[str, list[BlockCandidate]]
    ) -> str:
        info = ScheduleOptimizer._task_info(task_id, candidate_map)
        if status in ("INFEASIBLE", "ERROR", "UNKNOWN"):
            if status == "INFEASIBLE":
                return "model infeasible: mandatory urgent placements conflict"
            return f"solver produced no solution ({status.lower()})"
        if info["feasible_candidate_count"] == 0:
            if info["candidate_count"] == 0:
                return "no candidate placements generated"
            codes = ",".join(info["rejection_codes"]) or "hard constraints"
            return f"no feasible candidate placements (rejected: {codes})"
        return "schedulable but not selected by optimizer"

    # -------------------------------------------------------------- objective terms

    def _objective_terms(self, records: list[_Record], ctx: PlanningContext) -> dict[str, int]:
        weights = self._settings.objective_weights
        scale = _SCALE
        terms: dict[str, int] = {}
        for record in records:
            value = 0.0
            value += weights.task_completion * len(record.task_ids)
            value += weights.priority_adherence * record.priority_sum
            value += weights.overdue_reduction * record.overdue_sum
            if record.kind == "INTEGRATED":
                value += weights.slot_consolidation * (len(record.task_ids) - 1)
            value += weights.resource_efficiency * record.utilization
            value -= weights.forecast_alignment * record.disruption
            terms[record.key] = round(value * scale)
        return terms

    def _build_records(
        self,
        candidates: list[BlockCandidate],
        integrated: list[IntegratedBlockCandidate],
        ctx: PlanningContext,
    ) -> list[_Record]:
        task_lookup = {task.task_id: task for task in ctx.tasks}
        ai_recs = {rec.task_id: rec for rec in ctx.priorities}

        def score(priority) -> float:
            return _PRIORITY_ENUM_SCORE.get(priority.value, _FALLBACK_PRIORITY_SCORE)

        records: list[_Record] = []
        for candidate in sorted(candidates, key=lambda c: c.candidate_id):
            task = task_lookup.get(candidate.task_ids[0])
            task_ids = tuple(candidate.task_ids)
            resources = self._record_resources(task_ids, task_lookup, candidate.metadata)
            span = self._span_minutes(candidate.start_time, candidate.end_time)
            records.append(
                _Record(
                    key=f"SINGLE:{candidate.candidate_id}",
                    label=candidate.candidate_id,
                    task_ids=task_ids,
                    corridor_id=candidate.corridor_id,
                    section=candidate.section,
                    start=candidate.start_time,
                    end=candidate.end_time,
                    total_minutes=span,
                    kind="SINGLE",
                    source_ids=(candidate.candidate_id,),
                    required_resources=resources,
                    priority_sum=self._single_priority_sum(task, ai_recs, score),
                    overdue_sum=self._overdue_score(task, ctx),
                    utilization=1.0,
                    disruption=self._disruption_score(
                        candidate.corridor_id, candidate.section,
                        candidate.start_time, candidate.end_time, ctx,
                    ),
                )
            )

        for block in sorted(integrated, key=lambda b: b.block_id):
            tasks = [task_lookup[t] for t in block.task_ids if t in task_lookup]
            resources: set = set()
            priority_sum = 0.0
            overdue_sum = 0.0
            for task in tasks:
                resources.update(task.required_resources)
                rec = ai_recs.get(task.task_id)
                priority_sum += (
                    min(1.0, max(0.0, rec.priority_score / 100.0))
                    if rec is not None
                    else score(task.priority)
                )
                overdue_sum += self._overdue_score(task, ctx)
            span = self._span_minutes(block.window_start, block.window_end)
            records.append(
                _Record(
                    key=f"INTEGRATED:{block.block_id}",
                    label=block.block_id,
                    task_ids=tuple(sorted(block.task_ids)),
                    corridor_id=block.corridor_id,
                    section=block.section,
                    start=block.window_start,
                    end=block.window_end,
                    total_minutes=span,
                    kind="INTEGRATED",
                    source_ids=tuple(sorted(block.metadata.get("source_candidate_ids", []))),
                    required_resources=tuple(sorted(resources)),
                    priority_sum=priority_sum,
                    overdue_sum=overdue_sum,
                    utilization=1.0,
                    disruption=self._disruption_score(
                        block.corridor_id, block.section,
                        block.window_start, block.window_end, ctx,
                    ),
                )
            )
        records.sort(key=lambda r: r.key)
        return records

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _record_resources(
        task_ids: tuple[str, ...],
        task_lookup: dict,
        metadata: dict,
    ) -> tuple[str, ...]:
        resources: set = set(metadata.get("required_resources", []) if metadata else [])
        for task_id in task_ids:
            task = task_lookup.get(task_id)
            if task is not None:
                resources.update(task.required_resources)
        return tuple(sorted(resources))

    @staticmethod
    def _single_priority_sum(task, ai_recs, enum_fallback) -> float:
        if task is None:
            return _FALLBACK_PRIORITY_SCORE
        rec = ai_recs.get(task.task_id)
        if rec is not None:
            return min(1.0, max(0.0, rec.priority_score / 100.0))
        return enum_fallback(task.priority)

    @staticmethod
    def _span_minutes(start: datetime, end: datetime) -> int:
        return max(1, int((end - start).total_seconds() // 60))

    def _overdue_score(self, task: MaintenanceTask | None, ctx: PlanningContext) -> float:
        if task is None or task.due_by is None or ctx.horizon_start is None:
            return 0.0
        days = (ctx.horizon_start.date() - task.due_by).days
        if days <= 0:
            return 0.0
        return min(1.0, days / self._settings.planning_horizon_days)

    def _disruption_score(
        self,
        corridor_id: str,
        section: str,
        start: datetime,
        end: datetime,
        ctx: PlanningContext,
    ) -> float:
        threshold = self._settings.goods_forecast_probability_threshold
        peak = self._settings.goods_forecast_peak_threshold
        denominator = peak - threshold
        if denominator <= 0:
            return 0.0
        penalty = 0.0
        start_time = start.time()
        end_time = end.time()
        for forecast in ctx.goods_forecasts:
            if forecast.corridor_id != corridor_id or forecast.section != section:
                continue
            if forecast.date != start.date():
                continue
            if not self._time_overlap(start_time, end_time, forecast.window_start, forecast.window_end):
                continue
            if forecast.probability <= threshold:
                continue
            penalty += min(1.0, (forecast.probability - threshold) / denominator)
        return penalty

    @staticmethod
    def _time_overlap(a_start, a_end, b_start, b_end) -> bool:
        return a_start < b_end and b_start < a_end

    def _resolve_priority_source(self, tasks: Sequence[MaintenanceTask], ctx: PlanningContext) -> str:
        task_ids = {task.task_id for task in tasks}
        if any(rec.task_id in task_ids for rec in ctx.priorities):
            return "ai"
        return "task_priority_fallback"


__all__ = ["ScheduleOptimizer"]