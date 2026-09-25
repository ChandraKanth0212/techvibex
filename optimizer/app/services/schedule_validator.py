"""Independent schedule validation (Phase 4).

Implements the :class:`app.services.ScheduleValidator` interface for a
:class:`ScheduleResult` WITHOUT trusting the CP-SAT solver.

Guiding principle — *independent verification*:

- the validator never calls ``ScheduleOptimizer.optimize()`` and never rebuilds
  the CP-SAT model: it operates on the finished schedule plus the domain
  context;
- solver status (``OPTIMAL`` / ``FEASIBLE`` / ...) is treated purely as
  metadata: ``valid`` is decided by the reported schedule's own content, so an
  ``OPTIMAL`` schedule can be invalid and a ``FEASIBLE`` schedule valid;
- every selected block is re-read from scratch and the existing
  :class:`ConstraintEngine` is reused (via reconstructed ``BlockCandidate``
  placements) for the domain rules it already owns: planning horizon, corridor
  / section availability, existing blocks, protected train movements with the
  configured safety buffer, resource availability and goods-forecast windows.

Independent schedule-level checks on top of the engine:

1. block time validity (``start < end``, declared duration matches the actual
   time span, placement inside the planning horizon);
2. task validity (every scheduled task exists, no task scheduled more than
   once, every block task is represented in ``scheduled_task_ids`` and vice
   versa);
3. candidate validity — the selected placement itself must be a feasible
   placement (engine-validated);
4. corridor conflicts — overlapping selected blocks on the same corridor +
   section are rejected;
5. train conflicts — protected movements and the configured safety buffer are
   respected (engine);
6. existing-block conflicts — the schedule never collides with incompatible
   existing blocks (engine);
7. resource conflicts — capacity-1 resources are never double-booked by
   overlapping blocks;
8. location compatibility — block / task corridor and section mismatches are
   reported;
9. integrated-block validity — every participating task is compatible, the
   block duration equals the sequential sum of participant durations, and no
   task is silently omitted;
10. unscheduled/scheduled consistency — the two id lists never overlap, the
    ``TaskSchedulingInfo`` records agree with ``unscheduled_task_ids``, and a
    non-solution solver status never coexists with a populated schedule.

Conflict-code policy: domain conflicts reuse the existing ``ConflictCode``
vocabulary verbatim. Schedule-structure issues the domain vocabulary does not
name use a small documented set:

- ``UNKNOWN_TASK``          - a scheduled/blocked task id is absent from context
- ``DUPLICATE_TASK``        - a task is assigned to more than one block / list
- ``TASK_NOT_COVERED``      - scheduled ids without a block, or blocked unscheduled
- ``SCHEDULE_INCONSISTENT`` - cross-list contradictions (scheduled ∩ unscheduled,
                              record mismatches, status-vs-schedule contradictions)
- ``NO_SOLUTION``           - WARNING: solver reported no solution, empty schedule

``POWER_CONFLICT`` and ``DEPENDENCY_CONFLICT`` remain explicitly unsupported
because the current schemas carry no power-isolation or dependency fields
(``app.constraints.codes.UNSUPPORTED_CONFLICT_CODES``) — the validator never
invents them.

Determinism: blocks and tasks are visited in sorted order and every violation is
canonically ordered, so identical input + configuration yields an identical
validation result.
"""

from datetime import timedelta

from app.constraints.codes import (
    SUPPORTED_CONFLICT_CODES,
    UNSUPPORTED_CONFLICT_CODES,
    ConflictCode,
)
from app.constraints.engine import ConstraintEngine
from app.core.config import Settings, get_settings
from app.core.context import PlanningContext
from app.services import ScheduleValidator as ScheduleValidatorInterface
from contracts import BlockCandidate, ConstraintViolation, ScheduleResult, ScheduleValidationResult, ViolationSeverity

#: Solver statuses that indicate a solution was actually produced.
_SOLVED_STATUSES = frozenset({"OPTIMAL", "FEASIBLE"})

#: Validator-level report codes for schedule-structure issues the domain
#: ConflictCode vocabulary does not name. These extend—never replace—the
#: existing code system and are documented in the module + README.
UNKNOWN_TASK = "UNKNOWN_TASK"
DUPLICATE_TASK = "DUPLICATE_TASK"
TASK_NOT_COVERED = "TASK_NOT_COVERED"
SCHEDULE_INCONSISTENT = "SCHEDULE_INCONSISTENT"
NO_SOLUTION = "NO_SOLUTION"

_VALIDATOR_CODES = frozenset(
    {
        UNKNOWN_TASK,
        DUPLICATE_TASK,
        TASK_NOT_COVERED,
        SCHEDULE_INCONSISTENT,
        NO_SOLUTION,
    }
)


def _minutes_between(start, end) -> int:
    """Whole minutes between two datetimes (may be scalar arithmetic notes)."""
    return int((end - start).total_seconds() // 60)


def _duplicates(items) -> list[str]:
    """Ids that appear more than once in ``items``, in deterministic order."""
    counts: dict[str, int] = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    return sorted(oid for oid, count in counts.items() if count > 1)


def _violation_key(violation: ConstraintViolation) -> tuple:
    return (
        violation.block_id or "",
        violation.violation_code,
        violation.reason,
        violation.message,
        tuple(violation.affected_ids),
    )


class ScheduleValidator(ScheduleValidatorInterface):
    """Independently validates a :class:`ScheduleResult` against the context."""

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
    def supported_codes(self) -> frozenset[str]:
        """Conflict + report codes this validator can emit."""
        return SUPPORTED_CONFLICT_CODES | _VALIDATOR_CODES

    @property
    def unsupported_constraints(self) -> dict[str, str]:
        """Codes explicitly not enforced, plus the schema-level reason."""
        return dict(UNSUPPORTED_CONFLICT_CODES)

    # -------------------------------------------------------- public contract

    def validate(self, result: ScheduleResult, context: dict) -> ScheduleValidationResult:
        """Independently validate a schedule; OPTIMAL/FEASIBLE never imply valid."""
        if isinstance(result, dict):
            result = ScheduleResult.model_validate(result)
        ctx = PlanningContext.from_dict(context.model_dump() if hasattr(context, "model_dump") else context)
        return self._validate(result, ctx)

    # ------------------------------------------------------------- core pass

    def _validate(self, result: ScheduleResult, ctx: PlanningContext) -> ScheduleValidationResult:
        errors: list[ConstraintViolation] = []
        warnings: list[ConstraintViolation] = []

        task_lookup = {task.task_id: task for task in ctx.tasks}
        ctx_task_ids = set(task_lookup)
        resource_catalog = {resource.resource_id: resource for resource in ctx.resources}
        context_dump = ctx.model_dump()

        blocks = sorted(result.selected_blocks or [], key=lambda block: block.block_id)
        scheduled = list(result.scheduled_task_ids or [])
        unscheduled = list(result.unscheduled_task_ids or [])
        infos = list(result.unscheduled_tasks or [])

        # ------------------------------------------------ schedule structure
        scheduled_set = set(scheduled)
        unscheduled_set = set(unscheduled)

        for ids, name in ((scheduled, "scheduled_task_ids"), (unscheduled, "unscheduled_task_ids")):
            for dup in _duplicates(ids):
                errors.append(
                    self._violation(
                        DUPLICATE_TASK,
                        "SCHEDULE_STRUCTURE",
                        block_id=None,
                        task_ids=[dup],
                        reason=f"DUPLICATE_IN_{name.upper()}:{dup}",
                        message=f"task '{dup}' appears more than once in {name}",
                    )
                )

        overlap = sorted(scheduled_set & unscheduled_set)
        if overlap:
            errors.append(
                self._violation(
                    SCHEDULE_INCONSISTENT,
                    "SCHEDULE_STRUCTURE",
                    block_id=None,
                    task_ids=overlap,
                    reason="SCHEDULED_UNSCHEDULED_OVERLAP",
                    message="scheduled_task_ids and unscheduled_task_ids overlap",
                )
            )

        # ----------------------------------------------- task existence
        for task_id in sorted(scheduled_set | unscheduled_set):
            if task_id not in ctx_task_ids:
                errors.append(
                    self._violation(
                        UNKNOWN_TASK,
                        "TASK_VALIDITY",
                        block_id=None,
                        task_ids=[task_id],
                        reason="TASK_UNKNOWN",
                        message=f"task '{task_id}' is not present in the planning context",
                    )
                )

        # ------------------------------------------------ duplicate assignment
        block_count: dict[str, int] = {}
        for block in blocks:
            for task_id in block.task_ids:
                block_count[task_id] = block_count.get(task_id, 0) + 1
        for task_id in block_count:
            if task_id not in ctx_task_ids:
                errors.append(
                    self._violation(
                        UNKNOWN_TASK,
                        "TASK_VALIDITY",
                        block_id=None,
                        task_ids=[task_id],
                        reason="TASK_UNKNOWN",
                        message=f"block references task '{task_id}' absent from the planning context",
                    )
                )
        duplicates = sorted(tid for tid, count in block_count.items() if count > 1)
        if duplicates:
            errors.append(
                self._violation(
                    DUPLICATE_TASK,
                    "TASK_VALIDITY",
                    block_id=None,
                    task_ids=duplicates,
                    reason=f"DUPLICATE_TASK_ASSIGNMENT:{','.join(duplicates)}",
                    message="a task is assigned to more than one selected block",
                )
            )

        # ------------------------------------------------ coverage
        block_task_ids = {task_id for block in blocks for task_id in block.task_ids}
        only_scheduled = sorted(scheduled_set - block_task_ids)
        if only_scheduled:
            errors.append(
                self._violation(
                    TASK_NOT_COVERED,
                    "TASK_VALIDITY",
                    block_id=None,
                    task_ids=only_scheduled,
                    reason="SCHEDULED_TASK_WITHOUT_BLOCK",
                    message="scheduled_task_ids includes tasks represented by no selected block",
                )
            )
        only_blocked = sorted(block_task_ids - scheduled_set)
        if only_blocked:
            errors.append(
                self._violation(
                    TASK_NOT_COVERED,
                    "TASK_VALIDITY",
                    block_id=None,
                    task_ids=only_blocked,
                    reason="BLOCK_TASK_NOT_IN_SCHEDULED",
                    message="selected blocks cover tasks missing from scheduled_task_ids",
                )
            )

        # ------------------------------------------------ per-block checks
        for block in blocks:
            errors.extend(self._validate_block(block, ctx, task_lookup, context_dump))

        # ------------------------------------------------ pairwise conflicts
        block_resources = {
            block.block_id: self._block_resources(block, task_lookup) for block in blocks
        }
        n = len(blocks)
        for i in range(n):
            for j in range(i + 1, n):
                a, b = blocks[i], blocks[j]
                if a.end_time <= a.start_time or b.end_time <= b.start_time:
                    continue
                if not (a.start_time < b.end_time and b.start_time < a.end_time):
                    continue
                if a.corridor_id == b.corridor_id and a.section == b.section:
                    errors.append(
                        self._violation(
                            ConflictCode.CORRIDOR_CONFLICT.value,
                            "CORRIDOR_CONFLICTS",
                            block_id=a.block_id,
                            task_ids=list(a.task_ids) + list(b.task_ids),
                            reason=f"SAME_SECTION_OVERLAP:{b.block_id}",
                            message="overlapping selected blocks occupy the same corridor section",
                        )
                    )
                shared = sorted(
                    resource_id
                    for resource_id in (block_resources[a.block_id] & block_resources[b.block_id])
                    if resource_catalog.get(resource_id) is not None
                    and resource_catalog[resource_id].capacity == 1
                )
                if shared:
                    errors.append(
                        self._violation(
                            ConflictCode.RESOURCE_CONFLICT.value,
                            "RESOURCE_CONFLICTS",
                            block_id=a.block_id,
                            task_ids=list(a.task_ids) + list(b.task_ids),
                            reason=f"CAPACITY_ONE_DOUBLE_BOOKING:{','.join(shared)}",
                            message="overlapping blocks double-book a capacity-1 resource",
                        )
                    )

        # ------------------------------------------------ unscheduled records
        info_ids = [info.task_id for info in infos]
        for dup in _duplicates(info_ids):
            errors.append(
                self._violation(
                    DUPLICATE_TASK,
                    "SCHEDULE_STRUCTURE",
                    block_id=None,
                    task_ids=[dup],
                    reason=f"DUPLICATE_UNSCHEDULED_INFO:{dup}",
                    message="unscheduled task record appears more than once",
                )
            )
        if set(info_ids) != unscheduled_set:
            errors.append(
                self._violation(
                    SCHEDULE_INCONSISTENT,
                    "SCHEDULE_STRUCTURE",
                    block_id=None,
                    task_ids=sorted(set(info_ids) ^ unscheduled_set),
                    reason="UNSCHEDULED_INFO_MISMATCH",
                    message="TaskSchedulingInfo records do not match unscheduled_task_ids",
                )
            )
        for info in infos:
            if info.scheduled:
                errors.append(
                    self._violation(
                        SCHEDULE_INCONSISTENT,
                        "SCHEDULE_STRUCTURE",
                        block_id=None,
                        task_ids=[info.task_id],
                        reason="UNSCHEDULED_INFO_SCHEDULED_FLAG",
                        message=f"unscheduled record for '{info.task_id}' has scheduled=True",
                    )
                )
            if info.task_id in scheduled_set:
                errors.append(
                    self._violation(
                        SCHEDULE_INCONSISTENT,
                        "SCHEDULE_STRUCTURE",
                        block_id=None,
                        task_ids=[info.task_id],
                        reason="UNSCHEDULED_INFO_IN_SCHEDULED",
                        message=f"unscheduled record for '{info.task_id}' is listed as scheduled",
                    )
                )

        # ------------------------------------------------ solver status honesty
        had_solution = result.status in _SOLVED_STATUSES
        if not had_solution:
            if blocks or scheduled_set:
                errors.append(
                    self._violation(
                        SCHEDULE_INCONSISTENT,
                        "SOLVER_STATUS",
                        block_id=None,
                        task_ids=sorted(scheduled_set),
                        reason=f"STATUS_{result.status}_WITH_SCHEDULE",
                        message=f"solver status '{result.status}' coexists with a non-empty schedule",
                    )
                )
            else:
                warnings.append(
                    self._violation(
                        NO_SOLUTION,
                        "SOLVER_STATUS",
                        block_id=None,
                        task_ids=[],
                        reason="NO_SOLUTION",
                        message=f"solver reported '{result.status}'; the schedule contains no blocks",
                        severity=ViolationSeverity.WARNING,
                    )
                )

        # ------------------------------------------------ canonical ordering
        errors.sort(key=_violation_key)
        warnings.sort(key=_violation_key)

        checked_tasks = len(scheduled_set | unscheduled_set | block_task_ids)
        metadata = {
            "validator": "schedule_validator",
            "solver_status": result.status,
            "solver_status_had_solution": had_solution,
            "checked_categories": [
                "schedule_structure",
                "block_time",
                "task_validity",
                "candidate_validity",
                "task_location",
                "task_windows",
                "integrated_block",
                "corridor_conflicts",
                "resource_conflicts",
                "solver_status",
            ],
            "unsupported_constraints": {
                code: UNSUPPORTED_CONFLICT_CODES[code] for code in sorted(UNSUPPORTED_CONFLICT_CODES)
            },
            "deterministic": True,
        }

        return ScheduleValidationResult(
            schedule_id=result.schedule_id,
            solver_status=result.status,
            valid=not errors,
            errors=errors,
            warnings=warnings,
            checked_block_count=len(blocks),
            checked_task_count=checked_tasks,
            metadata=metadata,
        )

    # ------------------------------------------------------------ block checks

    def _validate_block(
        self,
        block,
        ctx: PlanningContext,
        task_lookup: dict,
        context_dump: dict,
    ) -> list[ConstraintViolation]:
        findings: list[ConstraintViolation] = []

        # ------------------------------------------------------- 1. block time
        if block.end_time <= block.start_time:
            findings.append(
                self._violation(
                    ConflictCode.DURATION_CONFLICT.value,
                    "BLOCK_TIME",
                    block_id=block.block_id,
                    task_ids=list(block.task_ids),
                    reason="INVALID_TIME_RANGE",
                    message="block end_time is not after start_time",
                )
            )
            return findings

        span = _minutes_between(block.start_time, block.end_time)
        if span != block.total_duration_minutes:
            findings.append(
                self._violation(
                    ConflictCode.DURATION_CONFLICT.value,
                    "BLOCK_TIME",
                    block_id=block.block_id,
                    task_ids=list(block.task_ids),
                    reason=f"DURATION_SPAN_MISMATCH:span={span}:declared={block.total_duration_minutes}",
                    message="declared total_duration_minutes does not match the block's time span",
                )
            )

        if block.block_type == "SINGLE" and len(set(block.task_ids)) != 1:
            findings.append(
                self._violation(
                    SCHEDULE_INCONSISTENT,
                    "SCHEDULE_STRUCTURE",
                    block_id=block.block_id,
                    task_ids=list(block.task_ids),
                    reason="SINGLE_BLOCK_MULTI_TASK",
                    message="SINGLE block must cover exactly one task",
                )
            )

        unique_ids = sorted(set(block.task_ids))
        resolved = {task_id: task_lookup[task_id] for task_id in unique_ids if task_id in task_lookup}
        all_resolved = len(resolved) == len(unique_ids) and bool(unique_ids)

        # --------------------------------------- 9. integrated sequential duration
        if block.block_type == "INTEGRATED" and all_resolved:
            expected = sum(resolved[task_id].estimated_duration_minutes for task_id in unique_ids)
            if expected != span:
                findings.append(
                    self._violation(
                        ConflictCode.DURATION_CONFLICT.value,
                        "INTEGRATED_BLOCK",
                        block_id=block.block_id,
                        task_ids=list(block.task_ids),
                        reason=f"INTEGRATED_SEQUENTIAL_SHORTFALL:expected={expected}:span={span}",
                        message="integrated block duration does not match the sequential sum of participant durations",
                    )
                )

        # ----------------------------------------------- 8. per-task compatibility
        sub_windows: dict[str, tuple] = {}
        offset = timedelta(0)
        for task_id in unique_ids:
            task = resolved.get(task_id)
            if task is None:
                continue
            if all_resolved:
                sub_start = block.start_time + offset
                sub_end = sub_start + timedelta(minutes=task.estimated_duration_minutes)
                offset += timedelta(minutes=task.estimated_duration_minutes)
            else:
                sub_start, sub_end = block.start_time, block.end_time
            sub_windows[task_id] = (sub_start, sub_end)

            if task.corridor_id != block.corridor_id:
                findings.append(
                    self._violation(
                        ConflictCode.CORRIDOR_CONFLICT.value,
                        "TASK_LOCATION",
                        block_id=block.block_id,
                        task_ids=[task_id],
                        reason=f"TASK_CORRIDOR_MISMATCH:task={task_id}:block={block.corridor_id}:task={task.corridor_id}",
                        message="task corridor does not match the block's corridor",
                    )
                )
            section = self._task_section(task, ctx)
            if section and section != block.section:
                findings.append(
                    self._violation(
                        ConflictCode.LOCATION_CONFLICT.value,
                        "TASK_LOCATION",
                        block_id=block.block_id,
                        task_ids=[task_id],
                        reason=f"TASK_SECTION_MISMATCH:task={task_id}:resolved={section}:block={block.section}",
                        message="task section does not match the block's section",
                    )
                )
            if task.window_start is not None and task.window_end is not None:
                if sub_start < task.window_start or sub_end > task.window_end:
                    findings.append(
                        self._violation(
                            ConflictCode.TIME_CONFLICT.value,
                            "TASK_WINDOWS",
                            block_id=block.block_id,
                            task_ids=[task_id],
                            reason="TASK_WINDOW_VIOLATION",
                            message="task is scheduled outside its declared window",
                        )
                    )

        # ----------------------------------------------------- single-task duration
        if block.block_type == "SINGLE" and len(unique_ids) == 1:
            task = resolved.get(unique_ids[0])
            if task is not None and task.estimated_duration_minutes != span:
                tid = unique_ids[0]
                findings.append(
                    self._violation(
                        ConflictCode.DURATION_CONFLICT.value,
                        "BLOCK_TIME",
                        block_id=block.block_id,
                        task_ids=[tid],
                        reason=f"DURATION_NOT_TASK_DURATION:task={tid}:task_duration={task.estimated_duration_minutes}:span={span}",
                        message="single block span does not match the task's estimated duration",
                    )
                )

        # --------------------------------- 3. candidate/placement feasibility
        placement = self._placement(
            candidate_id=f"VAL:{block.block_id}:GROUP",
            task_ids=sorted(set(block.task_ids)),
            corridor_id=block.corridor_id,
            section=block.section,
            start_time=block.start_time,
            end_time=block.end_time,
        )
        for violation in self._engine.validate(placement, context_dump):
            findings.append(self._relabel(violation, block.block_id))

        # --------------------------------- 9. per-participant placement (integrated)
        if block.block_type == "INTEGRATED" and all_resolved:
            for task_id in unique_ids:
                sub_start, sub_end = sub_windows[task_id]
                candidate = self._placement(
                    candidate_id=f"VAL:{block.block_id}:{task_id}",
                    task_ids=[task_id],
                    corridor_id=block.corridor_id,
                    section=block.section,
                    start_time=sub_start,
                    end_time=sub_end,
                )
                for violation in self._engine.validate(candidate, context_dump):
                    findings.append(self._relabel(violation, block.block_id))

        return findings

    # ---------------------------------------------------------------- helpers

    def _violation(
        self,
        code: str,
        category: str,
        *,
        block_id: str | None,
        task_ids: list[str],
        reason: str,
        message: str,
        severity: ViolationSeverity = ViolationSeverity.ERROR,
    ) -> ConstraintViolation:
        return ConstraintViolation(
            constraint_name=category,
            violation_code=code,
            message=message,
            severity=severity,
            block_id=block_id,
            affected_ids=sorted(set(task_ids or [])),
            reason=reason,
        )

    @staticmethod
    def _placement(candidate_id, task_ids, corridor_id, section, start_time, end_time) -> BlockCandidate:
        span = _minutes_between(start_time, end_time)
        return BlockCandidate(
            candidate_id=candidate_id,
            task_ids=list(task_ids),
            corridor_id=corridor_id,
            section=section,
            start_time=start_time,
            end_time=end_time,
            total_duration_minutes=span,
            metadata={"required_duration_minutes": span},
        )

    @staticmethod
    def _relabel(violation: ConstraintViolation, block_id: str) -> ConstraintViolation:
        if violation.block_id == block_id:
            return violation
        return violation.model_copy(update={"block_id": block_id})

    @staticmethod
    def _block_resources(block, task_lookup: dict) -> set[str]:
        resources: set[str] = set()
        for task_id in sorted(set(block.task_ids)):
            task = task_lookup.get(task_id)
            if task is not None:
                resources.update(task.required_resources)
        return resources

    @staticmethod
    def _task_section(task, ctx: PlanningContext) -> str | None:
        asset = next(
            (a for a in ctx.assets if a.asset_id == task.asset_id and a.corridor_id == task.corridor_id),
            None,
        )
        if asset is not None:
            return asset.section
        metadata_section = task.metadata.get("section")
        return metadata_section if metadata_section else None


__all__ = [
    "ScheduleValidator",
    "UNKNOWN_TASK",
    "DUPLICATE_TASK",
    "TASK_NOT_COVERED",
    "SCHEDULE_INCONSISTENT",
    "NO_SOLUTION",
]