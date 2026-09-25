"""Request/response models for the Phase 7A REST API.

These DTOs are the only shapes the HTTP layer accepts or emits. Internal
engine objects (the OR-Tools model, service internals) never cross this
boundary. The shared contract models (``ScheduleResult``,
``ScheduleValidationResult``, ``ScheduleMetrics``, ``ExplainabilityResult``,
``BlockCandidate``, ``IntegratedBlockCandidate``, ...) are embedded verbatim so
no solver metadata, reason code or evidence is lost during serialisation.

Per-request settings are expressed with :class:`ModelSettings`, a validated
subset of :class:`app.core.config.Settings`; unknown/missing settings fall back
to the application configuration, guaranteeing determinism for identical input
plus configuration.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.config import Settings
from app.core.context import PlanningContext
from contracts import (
    BlockCandidate,
    BlockRequest,
    ConstraintViolation,
    ExplainabilityResult,
    IntegratedBlockCandidate,
    ScheduleMetrics,
    ScheduleResult,
    ScheduleValidationResult,
)

# ------------------------------------------------------------------ requests


class ModelSettings(BaseModel):
    """Validated per-request override of ``app.core.config.Settings``.

    Every field is optional; fields left unset inherit the application
    settings. ``resolve(base)`` folds the overrides into a fresh ``Settings``.
    """

    safety_buffer_minutes: int | None = Field(default=None, ge=0)
    goods_forecast_probability_threshold: float | None = Field(
        default=None, ge=0.0, le=1.0
    )
    goods_forecast_peak_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    solver_timeout_seconds: int | None = Field(default=None, gt=0)
    planning_horizon_days: int | None = Field(default=None, gt=0)
    candidate_step_minutes: int | None = Field(default=None, ge=1)
    max_candidates_per_task: int | None = Field(default=None, ge=1)
    max_integrated_group_size: int | None = Field(default=None, ge=2)
    max_integrated_groups: int | None = Field(default=None, ge=1)
    max_placements_per_group: int | None = Field(default=None, ge=1)
    objective_weights: "ModelObjectiveWeights | None" = None

    def resolve(self, base: Settings) -> Settings:
        """Fold the set overrides into ``base``; unset fields inherit."""
        updates: dict = {}
        for name in type(self).model_fields:
            value = getattr(self, name)
            if value is None:
                continue
            if name == "objective_weights":
                merged = base.objective_weights.model_copy(
                    update={
                        key: override
                        for key, override in value.model_dump(exclude_none=True).items()
                    }
                )
                updates[name] = merged
            else:
                updates[name] = value
        if not updates:
            return base
        return base.model_copy(update=updates)


class ModelObjectiveWeights(BaseModel):
    """Optional per-request objective weights (unset fields inherit)."""

    slot_consolidation: float | None = Field(default=None, ge=0.0)
    priority_adherence: float | None = Field(default=None, ge=0.0)
    forecast_alignment: float | None = Field(default=None, ge=0.0)
    resource_efficiency: float | None = Field(default=None, ge=0.0)
    task_completion: float | None = Field(default=None, ge=0.0)
    overdue_reduction: float | None = Field(default=None, ge=0.0)


class OptimizeRequest(BaseModel):
    """Body for ``POST /api/optimizer/generate``.

    ``request`` is optional when the planning context defines exactly one
    ``block_requests`` entry; otherwise it is required. When supplied it is
    also registered into the context used by the pipeline so candidate windows
    and section resolution can benefit from it (task-level windows always win).
    """

    request: BlockRequest | None = None
    context: PlanningContext = Field(default_factory=PlanningContext)
    settings: ModelSettings | None = None


class CandidatesRequest(BaseModel):
    """Body for ``POST /api/optimizer/candidates``."""

    context: PlanningContext = Field(default_factory=PlanningContext)
    task_ids: list[str] | None = None
    settings: ModelSettings | None = None


class DiscoverRequest(BaseModel):
    """Body for ``POST /api/optimizer/integrated-blocks/discover``."""

    context: PlanningContext = Field(default_factory=PlanningContext)
    task_ids: list[str] | None = None
    settings: ModelSettings | None = None


class ValidateRequest(BaseModel):
    """Body for ``POST /api/optimizer/validate``.

    Accepts a ``ScheduleResult``-like payload plus the planning context; the
    pipeline never re-runs the optimizer for this endpoint.
    """

    schedule: ScheduleResult
    context: PlanningContext = Field(default_factory=PlanningContext)


# ----------------------------------------------------------------- responses


class CandidatesResponse(BaseModel):
    """Generated + rejected block candidates for a task scope."""

    task_ids: list[str]
    candidate_count: int
    feasible_count: int
    rejected_count: int
    rejection_codes: dict[str, int]
    candidates: list[BlockCandidate]
    data_mode: str = "SYNTHETIC_DEMO"
    storage: str = "IN_MEMORY"


class IntegratedBlocksResponse(BaseModel):
    """Discovered integrated-block groups for a task scope."""

    task_ids: list[str]
    groups_examined: int
    compatible_count: int
    rejection_codes: dict[str, int]
    candidates: list[IntegratedBlockCandidate]
    data_mode: str = "SYNTHETIC_DEMO"
    storage: str = "IN_MEMORY"


class ValidationResponse(BaseModel):
    """Independent validation outcome for a submitted schedule."""

    schedule_id: str
    solver_status: str
    valid: bool
    error_count: int
    warning_count: int
    checked_block_count: int
    checked_task_count: int
    errors: list[ConstraintViolation]
    warnings: list[ConstraintViolation]
    metadata: dict


class PlanResponse(BaseModel):
    """Full structured plan stored/returned by the API.

    ``storage`` is always ``IN_MEMORY`` in this phase: plans are kept only for
    the lifetime of the Python process and vanish on restart.
    """

    plan_id: str
    data_mode: str = "SYNTHETIC_DEMO"
    storage: str = "IN_MEMORY"
    request_id: str
    solver_status: str
    schedule: ScheduleResult
    validation: ScheduleValidationResult | None = None
    metrics: ScheduleMetrics | None = None
    explanations: ExplainabilityResult | None = None
    candidates: list[BlockCandidate] = Field(default_factory=list)
    integrated_candidates: list[IntegratedBlockCandidate] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)


class PlanMetricsResponse(BaseModel):
    """KPIs for a stored plan."""

    plan_id: str
    metrics: ScheduleMetrics


class PlanConflictsResponse(BaseModel):
    """Structured conflict/violation summary for a stored plan."""

    plan_id: str
    solver_status: str
    validation_valid: bool | None
    error_count: int
    warning_count: int
    errors: list[ConstraintViolation]
    warnings: list[ConstraintViolation]
    rejected_candidate_count: int
    candidate_rejection_codes: dict[str, int]


__all__ = [
    "CandidatesRequest",
    "CandidatesResponse",
    "DiscoverRequest",
    "IntegratedBlocksResponse",
    "ModelObjectiveWeights",
    "ModelSettings",
    "OptimizeRequest",
    "PlanConflictsResponse",
    "PlanMetricsResponse",
    "PlanResponse",
    "ValidateRequest",
    "ValidationResponse",
]