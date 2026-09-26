"""Request models and stable response-model re-exports for the REST API."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.config import Settings
from app.core.context import PlanningContext
from app.schemas.api import (
    CandidatesResponse,
    CandidateDTO,
    ErrorDetailDTO,
    ErrorResponse,
    ExplanationDTO,
    ExplanationRecordDTO,
    IntegratedBlockDTO,
    IntegratedBlocksResponse,
    MetricsDTO,
    PlanConflictsResponse,
    PlanMetricsResponse,
    PlanResponse,
    ScheduleDTO,
    SelectedBlockDTO,
    UnscheduledTaskDTO,
    ValidationDTO,
    ValidationResponse,
    ViolationDTO,
)
from contracts import BlockRequest

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
    """Body for ``POST /api/optimizer/validate``."""

    schedule: ScheduleDTO
    context: PlanningContext = Field(default_factory=PlanningContext)


# ----------------------------------------------------------------- responses


__all__ = [
    "CandidatesRequest",
    "CandidatesResponse",
    "CandidateDTO",
    "DiscoverRequest",
    "ErrorDetailDTO",
    "ErrorResponse",
    "ExplanationDTO",
    "ExplanationRecordDTO",
    "IntegratedBlockDTO",
    "IntegratedBlocksResponse",
    "MetricsDTO",
    "ModelObjectiveWeights",
    "ModelSettings",
    "OptimizeRequest",
    "PlanConflictsResponse",
    "PlanMetricsResponse",
    "PlanResponse",
    "ScheduleDTO",
    "SelectedBlockDTO",
    "UnscheduledTaskDTO",
    "ValidateRequest",
    "ValidationDTO",
    "ValidationResponse",
    "ViolationDTO",
]
