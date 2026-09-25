"""Input/output types shared by the optimization service interfaces.

These types describe the boundary between the service layers. They are part of
the temporary contract surface so that later phases can implement the interface
methods without changing signatures.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field, model_validator

from .enums import IntegratedCompatibility, ViolationSeverity


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class BlockCandidate(BaseModel):
    candidate_id: str = Field(min_length=1)
    task_ids: list[str] = Field(min_length=1)
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    start_time: datetime
    end_time: datetime
    total_duration_minutes: int = Field(gt=0)
    feasibility_score: float = Field(default=1.0, ge=0.0, le=1.0)
    source_request_id: str | None = None
    rejected: bool = False
    violations: list[ConstraintViolation] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_times(self) -> "BlockCandidate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self

    @property
    def rejection_codes(self) -> list[str]:
        """ERROR-severity violation codes, in their order of discovery."""
        return [v.violation_code for v in self.violations if v.severity == ViolationSeverity.ERROR]

    @property
    def feasible(self) -> bool:
        """A candidate is feasible when it was not marked as rejected."""
        return not self.rejected


class IntegratedBlock(BaseModel):
    block_id: str = Field(min_length=1)
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    candidate_ids: list[str] = Field(min_length=1)
    task_ids: list[str] = Field(min_length=1)
    start_time: datetime
    end_time: datetime
    shared_possession_minutes: int = Field(default=0, ge=0)
    work_types: list[str] = Field(default_factory=list)
    savings_estimate_minutes: float = Field(default=0.0, ge=0.0)

    @model_validator(mode="after")
    def _check_times(self) -> "IntegratedBlock":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class IntegratedBlockCandidate(BaseModel):
    """Outcome of detecting an integrated block opportunity for a task group.

    ``window_start`` / ``window_end`` hold the chosen validated placement when
    the group is COMPATIBLE and stay ``None`` for INCOMPATIBLE groups (whose
    rejection reasons are preserved in ``violations``).
    """

    block_id: str = Field(min_length=1)
    task_ids: list[str] = Field(min_length=1)
    request_ids: list[str] = Field(default_factory=list)
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    window_start: datetime | None = None
    window_end: datetime | None = None
    earliest_feasible_start: datetime
    latest_feasible_end: datetime
    total_required_duration_minutes: int = Field(gt=0)
    shared_possession_minutes: int | None = Field(default=None, ge=0)
    participating_departments: list[str] = Field(default_factory=list)
    work_types: list[str] = Field(default_factory=list)
    compatibility: IntegratedCompatibility = IntegratedCompatibility.COMPATIBLE
    violations: list[ConstraintViolation] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_times(self) -> "IntegratedBlockCandidate":
        if (
            self.window_start is not None
            and self.window_end is not None
            and self.window_end <= self.window_start
        ):
            raise ValueError("window_end must be after window_start")
        return self

    @property
    def rejection_codes(self) -> list[str]:
        """ERROR-severity violation codes, in their order of discovery."""
        return [v.violation_code for v in self.violations if v.severity == ViolationSeverity.ERROR]

    @property
    def compatible(self) -> bool:
        return self.compatibility == IntegratedCompatibility.COMPATIBLE

    def to_integrated_block(self) -> "IntegratedBlock":
        """Downstream bridge to the Phase 1 IntegratedBlock contract.

        Rejection detail is intentionally dropped here; the future CP-SAT
        optimizer consumes this slimmer model.
        """
        start = self.window_start or self.earliest_feasible_start
        end = self.window_end or start + timedelta(minutes=self.total_required_duration_minutes)
        candidate_ids = list(self.metadata.get("source_candidate_ids") or [])
        if not candidate_ids:
            candidate_ids = [f"{self.block_id}:{task_id}" for task_id in self.task_ids]
        shared = self.shared_possession_minutes
        if shared is None:
            shared = int((end - start).total_seconds() // 60)
        return IntegratedBlock(
            block_id=self.block_id,
            corridor_id=self.corridor_id,
            section=self.section,
            candidate_ids=candidate_ids,
            task_ids=list(self.task_ids),
            start_time=start,
            end_time=end,
            shared_possession_minutes=shared,
            work_types=list(self.work_types),
            savings_estimate_minutes=0.0,
        )


class ConstraintViolation(BaseModel):
    constraint_name: str
    violation_code: str
    message: str
    severity: ViolationSeverity = ViolationSeverity.ERROR
    block_id: str | None = None
    affected_ids: list[str] = Field(default_factory=list)
    reason: str = ""


class ValidationResult(BaseModel):
    """Outcome of validating a single candidate placement."""

    candidate_id: str = Field(min_length=1)
    valid: bool = False
    violations: list[ConstraintViolation] = Field(default_factory=list)

    @property
    def error_codes(self) -> list[str]:
        return [v.violation_code for v in self.violations if v.severity == ViolationSeverity.ERROR]

    @property
    def warning_codes(self) -> list[str]:
        return [v.violation_code for v in self.violations if v.severity == ViolationSeverity.WARNING]

    @property
    def rejected(self) -> bool:
        return not self.valid


class ScheduleSolution(BaseModel):
    solution_id: str = Field(min_length=1)
    blocks: list = Field(default_factory=list)
    objective_value: float = 0.0
    solver_status: str = ""
    created_at: datetime = Field(default_factory=_now_utc)
    metadata: dict = Field(default_factory=dict)


class OptimizationResult(BaseModel):
    status: str = Field(default="UNKNOWN", pattern="^(OPTIMAL|FEASIBLE|INFEASIBLE|TIMEOUT|ERROR|UNKNOWN)$")
    solution: ScheduleSolution | None = None
    runtime_seconds: float = Field(default=0.0, ge=0.0)
    message: str = ""


class ScheduleMetrics(BaseModel):
    """KPIs summarising a produced schedule's quality, coverage and honesty.

    Phase 1 fields: coverage and possession aggregates. Phase 5 added the
    consolidation, resource-utilisation, urgent-drop and independent-validation
    accuracy figures; the richer breakdown lives in ``extra`` so older consumers
    that read only the Phase 1 fields keep working unchanged.
    """

    total_tasks_requested: int = Field(default=0, ge=0)
    total_tasks_scheduled: int = Field(default=0, ge=0)
    task_coverage_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    integrated_blocks_count: int = Field(default=0, ge=0)
    conflicts_resolved: int = Field(default=0, ge=0)
    average_possession_minutes: float = Field(default=0.0, ge=0.0)
    slot_utilisation_percent: float = Field(default=0.0, ge=0.0)
    block_consolidation_ratio: float = Field(default=0.0, ge=0.0)
    resource_utilisation_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    scheduled_urgent_tasks: int = Field(default=0, ge=0)
    unscheduled_urgent_tasks: int = Field(default=0, ge=0)
    validation_accuracy_percent: float | None = Field(default=None, ge=0.0, le=100.0)
    extra: dict = Field(default_factory=dict)


class ValidationReport(BaseModel):
    valid: bool = False
    errors: list[ConstraintViolation] = Field(default_factory=list)
    warnings: list[ConstraintViolation] = Field(default_factory=list)
    summary: str = ""


class ScheduleBlock(BaseModel):
    """A single place on the plan: one task or one integrated multi-task block."""

    block_id: str = Field(min_length=1)
    task_ids: list[str] = Field(min_length=1)
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    start_time: datetime
    end_time: datetime
    block_type: str = Field(pattern="^(SINGLE|INTEGRATED)$")
    source_candidate_ids: list[str] = Field(default_factory=list)
    total_duration_minutes: int = Field(gt=0)
    objective_contribution: float = Field(default=0.0)
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_times(self) -> "ScheduleBlock":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class TaskSchedulingInfo(BaseModel):
    """Outcome record for a single task (scheduled or unscheduled), kept for
    the future Explainability module."""

    task_id: str = Field(min_length=1)
    scheduled: bool = False
    reason: str = ""
    candidate_count: int = Field(default=0, ge=0)
    feasible_candidate_count: int = Field(default=0, ge=0)
    rejection_codes: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class ScheduleResult(BaseModel):
    """Structured output of the CP-SAT ScheduleOptimizer (future API surface)."""

    schedule_id: str = Field(min_length=1)
    status: str = Field(pattern="^(OPTIMAL|FEASIBLE|INFEASIBLE|ERROR|UNKNOWN)$")
    message: str = ""
    selected_blocks: list[ScheduleBlock] = Field(default_factory=list)
    scheduled_task_ids: list[str] = Field(default_factory=list)
    unscheduled_task_ids: list[str] = Field(default_factory=list)
    unscheduled_tasks: list[TaskSchedulingInfo] = Field(default_factory=list)
    objective_value: float = Field(default=0.0)
    solver_metadata: dict = Field(default_factory=dict)

    def to_optimization_result(self) -> "OptimizationResult":
        """Bridge to the Phase 1 OptimizationResult contract."""
        solution = ScheduleSolution(
            solution_id=self.schedule_id,
            blocks=[block.model_dump() for block in self.selected_blocks],
            objective_value=self.objective_value,
            solver_status=self.status,
            metadata=dict(self.solver_metadata),
        )
        runtime = float(self.solver_metadata.get("solve_time_seconds", 0.0))
        return OptimizationResult(
            status=self.status,
            solution=solution,
            runtime_seconds=runtime,
            message=self.message,
        )


class ScheduleValidationResult(BaseModel):
    """Outcome of independently validating a :class:`ScheduleResult`.

    ``valid`` is decided ONLY by the reported schedule's own content. Solver
    status (``OPTIMAL`` / ``FEASIBLE`` / ...) is carried as ``solver_status``
    metadata and never implies validity: an ``OPTIMAL`` result can still be
    invalid and a ``FEASIBLE`` result valid.
    """

    schedule_id: str = ""
    solver_status: str = ""
    valid: bool = False
    errors: list[ConstraintViolation] = Field(default_factory=list)
    warnings: list[ConstraintViolation] = Field(default_factory=list)
    checked_block_count: int = Field(default=0, ge=0)
    checked_task_count: int = Field(default=0, ge=0)
    metadata: dict = Field(default_factory=dict)

    @property
    def error_codes(self) -> list[str]:
        """ERROR-severity violation codes, in their canonical order."""
        return [v.violation_code for v in self.errors if v.severity == ViolationSeverity.ERROR]

    @property
    def warning_codes(self) -> list[str]:
        """WARNING-severity violation codes, in their canonical order."""
        return [v.violation_code for v in self.warnings if v.severity == ViolationSeverity.WARNING]

    @property
    def summary(self) -> str:
        """One-line human summary of the validation outcome."""
        status = self.solver_status or "UNKNOWN"
        if not self.errors:
            return (
                f"valid schedule ({status}): {self.checked_block_count} blocks, "
                f"{self.checked_task_count} tasks, {len(self.warnings)} warnings"
            )
        return (
            f"invalid schedule ({status}): {len(self.errors)} errors, "
            f"{len(self.warnings)} warnings across {self.checked_block_count} blocks "
            f"and {self.checked_task_count} tasks"
        )

    def to_validation_report(self) -> "ValidationReport":
        """Bridge to the Phase 1 ValidationReport contract."""
        return ValidationReport(
            valid=self.valid,
            errors=list(self.errors),
            warnings=list(self.warnings),
            summary=self.summary,
        )


class ExplanationRecord(BaseModel):
    """A single deterministic, evidence-backed explanation (Phase 6).

    Every record is produced ONLY from structured inputs (the schedule result,
    planning context, optional validation result, optional metrics and optional
    candidate list). ``reason_codes`` reuse the existing conflict / validator
    vocabularies and add documented explainability codes; vague "AI decision"
    style codes are never emitted. ``evidence`` holds actual values only.
    """

    subject_type: str = Field(
        pattern=(
            "^(SCHEDULED_TASK|UNSCHEDULED_TASK|INTEGRATED_BLOCK|"
            "VALIDATION_ERROR|VALIDATION_WARNING|SCHEDULE|METRIC)$"
        )
    )
    subject_id: str = Field(min_length=1)
    status: str = Field(min_length=1)
    reason_codes: list[str] = Field(default_factory=list)
    summary: str = ""
    details: list[str] = Field(default_factory=list)
    evidence: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)


class ExplainabilityResult(BaseModel):
    """Structured output of the Phase 6 ExplainabilityService.

    ``records`` are emitted in deterministic order (sorted by
    ``subject_type`` then ``subject_id``). ``schedule_valid`` reflects ONLY the
    independent :class:`ScheduleValidationResult` when one was supplied;
    without it the field stays ``None`` (validity is never inferred from the
    solver status).
    """

    schedule_id: str = ""
    solver_status: str = ""
    schedule_valid: bool | None = None
    validation_provided: bool = False
    records: list[ExplanationRecord] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)

    @property
    def by_subject(self) -> dict[str, list[ExplanationRecord]]:
        """Records grouped by ``subject_id`` in deterministic order."""
        mapping: dict[str, list[ExplanationRecord]] = {}
        for record in self.records:
            mapping.setdefault(record.subject_id, []).append(record)
        return mapping

    @property
    def reason_code_counts(self) -> dict[str, int]:
        """Count of every reason code across all records, sorted by code."""
        counts: dict[str, int] = {}
        for record in self.records:
            for code in record.reason_codes:
                counts[code] = counts.get(code, 0) + 1
        return {code: counts[code] for code in sorted(counts)}

    def summary_text(self) -> str:
        """One-line human summary of the whole explanation."""
        scheduled = sum(
            1 for record in self.records if record.subject_type == "SCHEDULED_TASK"
        )
        unscheduled = sum(
            1 for record in self.records if record.subject_type == "UNSCHEDULED_TASK"
        )
        integrated = sum(
            1 for record in self.records if record.subject_type == "INTEGRATED_BLOCK"
        )
        text = (
            f"explanation for {self.schedule_id or '(no schedule)'} "
            f"[solver {self.solver_status or 'UNKNOWN'}]"
        )
        parts = []
        if self.schedule_valid is True:
            parts.append("independently valid")
        elif self.schedule_valid is False:
            parts.append("independently INVALID")
        elif not self.validation_provided:
            parts.append("validation not provided")
        if scheduled or unscheduled or integrated:
            counts = []
            if scheduled:
                counts.append(f"{scheduled} scheduled")
            if unscheduled:
                counts.append(f"{unscheduled} unscheduled")
            if integrated:
                counts.append(f"{integrated} integrated block(s)")
            text += f": " + ", ".join(counts)
        text += " (" + "; ".join(parts) + ")" if parts else ""
        return text