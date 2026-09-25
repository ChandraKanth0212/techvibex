"""Schedule KPI computation (Phase 5).

Implements the :class:`app.services.MetricsCalculator` interface for a
:class:`ScheduleResult`, turning the finished schedule and its planning context
into deterministic :class:`ScheduleMetrics`.

Honesty doctrine — metrics describe the schedule *as reported*, and the one
figure that can contradict the solver (``validation_accuracy_percent``) is never
invented:

- ``compute(result, context)`` without a validation result reports accuracy as
  ``None`` rather than guessing;
- coverage, possession and utilisation numbers are derived from the result + the
  provided context tasks, never from the solver's claims;
- ``conflicts_resolved`` counts the hard conflicts the schedule explicitly
  *respected* (rejection codes carried on unscheduled tasks) — it is not a
  count of violations (those would be accuracy *penalties*).

Metric definitions:

- ``total_tasks_requested`` = |scheduled_task_ids ∪ unscheduled_task_ids|
  (the tasks the result actually accounts for)
- ``task_coverage_ratio`` = scheduled / requested (0.0 when nothing requested)
- ``integrated_blocks_count`` = selected blocks of type ``INTEGRATED``
- ``block_consolidation_ratio`` = scheduled tasks per possession block
  (≈1.0 for pure single-task blocks, >1.0 when integration merges work)
- ``average_possession_minutes`` = mean selected-block span
- ``slot_utilisation_percent`` = total possession minutes / planning-horizon
  minutes (falls back to the blocks' union span when the context has no
  horizon; 0.0 when there is no span at all)
- ``resource_utilisation_percent`` = scheduled task-minutes / possession minutes
  (task minutes from the context's tasks; tasks missing from the context
  contribute 0, honestly lowering the figure)
- ``scheduled_urgent_tasks`` / ``unscheduled_urgent_tasks`` = URGENT-priority
  counts from the context task set
- ``conflicts_resolved`` = Σ rejection codes on unscheduled task records
- ``validation_accuracy_percent`` = 100.0 when the independent validator found
  no errors; otherwise 100.0 × (1 − min(1, errors / max(1, checked tasks,
  checked blocks))) — each validation *error* (a conflict the schedule actually
  carries) withdraws a proportional share. Warnings never lower accuracy.

Determinism: schedules are iterated in sorted block order and all derived maps
are sorted before emission.
"""

from app.core.config import Settings, get_settings
from app.services import MetricsCalculator as MetricsCalculatorInterface
from contracts import ScheduleMetrics, ScheduleResult, ScheduleValidationResult


def _minutes_between(start, end) -> int:
    return int((end - start).total_seconds() // 60)


def _task_lookup(context: dict) -> dict:
    tasks = context.get("tasks") or []
    return {task.task_id: task for task in tasks}


class MetricsCalculator(MetricsCalculatorInterface):
    """Deterministically summarises a :class:`ScheduleResult` into metrics."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def settings(self) -> Settings:
        return self._settings

    # -------------------------------------------------------- public contract

    def compute(
        self,
        result: ScheduleResult,
        context: dict,
        validation: ScheduleValidationResult | None = None,
    ) -> ScheduleMetrics:
        """Compute KPIs; ``validation`` optionally supplies the accuracy score."""
        if isinstance(result, dict):
            result = ScheduleResult.model_validate(result)
        task_lookup = _task_lookup(context)
        blocks = sorted(result.selected_blocks or [], key=lambda block: block.block_id)

        scheduled = set(result.scheduled_task_ids or [])
        unscheduled = set(result.unscheduled_task_ids or [])
        requested = sorted(scheduled | unscheduled)
        ordered_scheduled = sorted(scheduled)

        total_requested = len(requested)
        total_scheduled = len(ordered_scheduled)
        coverage = total_scheduled / total_requested if total_requested else 0.0

        integrated_count = sum(1 for block in blocks if block.block_type == "INTEGRATED")

        spans = [_minutes_between(block.start_time, block.end_time) for block in blocks]
        possession_total = sum(spans)
        average_possession = possession_total / len(blocks) if blocks else 0.0
        consolidation = total_scheduled / len(blocks) if blocks else 0.0

        horizon_minutes = self._horizon_minutes(context, blocks)
        slot_utilisation = (
            possession_total / horizon_minutes * 100.0 if horizon_minutes else 0.0
        )

        task_minutes = sum(
            self._block_task_minutes(block, task_lookup) for block in blocks
        )
        resource_utilisation = (
            min(100.0, task_minutes / possession_total * 100.0) if possession_total else 0.0
        )

        urgent_scheduled = sum(
            1 for task_id in ordered_scheduled if self._is_urgent(task_id, task_lookup)
        )
        urgent_unscheduled = sum(
            1 for task_id in sorted(unscheduled) if self._is_urgent(task_id, task_lookup)
        )

        conflicts_resolved, rejection_counts = self._rejection_breakdown(
            result.unscheduled_tasks or []
        )

        accuracy, validation_summary = self._accuracy(validation)

        extra = {
            "schedule_id": result.schedule_id,
            "solver_status": result.status,
            "possession_minutes_total": possession_total,
            "horizon_minutes": horizon_minutes,
            "scheduled_task_minutes": task_minutes,
            "rejection_code_counts": rejection_counts,
            "validation": validation_summary,
        }

        return ScheduleMetrics(
            total_tasks_requested=total_requested,
            total_tasks_scheduled=total_scheduled,
            task_coverage_ratio=round(coverage, 6),
            integrated_blocks_count=integrated_count,
            conflicts_resolved=conflicts_resolved,
            average_possession_minutes=round(average_possession, 2),
            slot_utilisation_percent=round(slot_utilisation, 2),
            block_consolidation_ratio=round(consolidation, 4),
            resource_utilisation_percent=round(resource_utilisation, 2),
            scheduled_urgent_tasks=urgent_scheduled,
            unscheduled_urgent_tasks=urgent_unscheduled,
            validation_accuracy_percent=(
                round(accuracy, 2) if accuracy is not None else None
            ),
            extra=extra,
        )

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _horizon_minutes(context: dict, blocks: list) -> int | None:
        horizon_start = context.get("horizon_start")
        horizon_end = context.get("horizon_end")
        if horizon_start is not None and horizon_end is not None:
            span = _minutes_between(horizon_start, horizon_end)
            if span > 0:
                return span
        if blocks:
            earliest = min(block.start_time for block in blocks)
            latest = max(block.end_time for block in blocks)
            return max(0, _minutes_between(earliest, latest))
        return None

    @staticmethod
    def _block_task_minutes(block, task_lookup: dict) -> int:
        total = 0
        for task_id in sorted(set(block.task_ids)):
            task = task_lookup.get(task_id)
            if task is not None:
                total += task.estimated_duration_minutes
        return total

    @staticmethod
    def _is_urgent(task_id: str, task_lookup: dict) -> bool:
        task = task_lookup.get(task_id)
        if task is None:
            return False
        priority = getattr(task, "priority", None)
        return getattr(priority, "value", priority) == "URGENT"

    @staticmethod
    def _rejection_breakdown(infos: list) -> tuple[int, dict[str, int]]:
        counts: dict[str, int] = {}
        resolved = 0
        for info in infos:
            for code in info.rejection_codes:
                counts[code] = counts.get(code, 0) + 1
                resolved += 1
        return resolved, {code: counts[code] for code in sorted(counts)}

    @staticmethod
    def _accuracy(validation) -> tuple[float | None, dict]:
        if validation is None:
            return None, {"provided": False}
        if isinstance(validation, dict):
            validation = ScheduleValidationResult.model_validate(validation)
        error_count = len(validation.errors)
        if error_count == 0:
            return 100.0, {
                "provided": True,
                "valid": validation.valid,
                "error_count": 0,
                "warning_count": len(validation.warnings),
            }
        denominator = max(1, validation.checked_block_count, validation.checked_task_count)
        scar = min(1.0, error_count / denominator)
        return 100.0 * (1.0 - scar), {
            "provided": True,
            "valid": validation.valid,
            "error_count": error_count,
            "warning_count": len(validation.warnings),
            "penalty_denominator": denominator,
        }


__all__ = ["MetricsCalculator"]