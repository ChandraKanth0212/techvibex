"""Stable Module 3 to Module 4 API DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ApiModel(BaseModel):
    """Base configuration for transport DTOs."""

    model_config = ConfigDict(extra="ignore")


class ViolationDTO(ApiModel):
    code: str
    severity: str
    message: str = ""
    affected_ids: list[str] = Field(default_factory=list)
    reason: str = ""


class UnscheduledTaskDTO(ApiModel):
    task_id: str
    scheduled: bool = False
    reason: str = ""
    candidate_count: int = Field(default=0, ge=0)
    feasible_candidate_count: int = Field(default=0, ge=0)
    rejection_codes: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SelectedBlockDTO(ApiModel):
    block_id: str
    task_ids: list[str] = Field(default_factory=list)
    request_ids: list[str] = Field(default_factory=list)
    corridor_id: str
    section: str
    start_time: datetime
    end_time: datetime
    duration_minutes: int = Field(default=0, ge=0)
    integrated: bool = False
    participating_departments: list[str] = Field(default_factory=list)
    resources: list[str] = Field(default_factory=list)
    status: str = "SCHEDULED"
    block_type: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _promote_legacy_duration(cls, value: Any) -> Any:
        if isinstance(value, dict) and "duration_minutes" not in value:
            legacy_duration = value.get("total_duration_minutes")
            if legacy_duration is not None:
                value = dict(value)
                value["duration_minutes"] = legacy_duration
        return value


class ScheduleDTO(ApiModel):
    schedule_id: str
    status: str
    message: str = ""
    objective_value: float = 0.0
    scheduled_task_ids: list[str] = Field(default_factory=list)
    unscheduled_task_ids: list[str] = Field(default_factory=list)
    unscheduled_tasks: list[UnscheduledTaskDTO] = Field(default_factory=list)
    selected_blocks: list[SelectedBlockDTO] = Field(default_factory=list)
    solver_metadata: dict[str, Any] = Field(default_factory=dict)


class ValidationDTO(ApiModel):
    schedule_id: str = ""
    solver_status: str = ""
    valid: bool = False
    errors: list[ViolationDTO] = Field(default_factory=list)
    warnings: list[ViolationDTO] = Field(default_factory=list)
    checked_block_count: int = Field(default=0, ge=0)
    checked_task_count: int = Field(default=0, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MetricsDTO(ApiModel):
    total_tasks_requested: int = Field(default=0, ge=0)
    total_tasks_scheduled: int = Field(default=0, ge=0)
    task_coverage_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    integrated_blocks_count: int = Field(default=0, ge=0)
    block_consolidation_ratio: float = Field(default=0.0, ge=0.0)
    average_possession_minutes: float = Field(default=0.0, ge=0.0)
    slot_utilisation_percent: float = Field(default=0.0, ge=0.0)
    resource_utilisation_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    scheduled_urgent_tasks: int = Field(default=0, ge=0)
    unscheduled_urgent_tasks: int = Field(default=0, ge=0)
    conflicts_resolved: int = Field(default=0, ge=0)
    validation_accuracy_percent: float | None = Field(default=None, ge=0.0, le=100.0)
    extra: dict[str, Any] = Field(default_factory=dict)


class ExplanationRecordDTO(ApiModel):
    subject_id: str
    subject_type: str
    status: str
    reason_codes: list[str] = Field(default_factory=list)
    summary: str = ""
    details: list[str] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExplanationDTO(ApiModel):
    schedule_id: str = ""
    solver_status: str = ""
    schedule_valid: bool | None = None
    validation_provided: bool = False
    records: list[ExplanationRecordDTO] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CandidateDTO(ApiModel):
    candidate_id: str
    task_ids: list[str] = Field(default_factory=list)
    corridor_id: str
    section: str
    start_time: datetime
    end_time: datetime
    duration_minutes: int = Field(default=0, ge=0)
    feasible: bool = True
    rejected: bool = False
    violations: list[ViolationDTO] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class IntegratedBlockDTO(ApiModel):
    block_id: str
    task_ids: list[str] = Field(default_factory=list)
    request_ids: list[str] = Field(default_factory=list)
    corridor_id: str
    section: str
    window_start: datetime | None = None
    window_end: datetime | None = None
    earliest_feasible_start: datetime | None = None
    latest_feasible_end: datetime | None = None
    total_required_duration_minutes: int = Field(default=0, ge=0)
    participating_departments: list[str] = Field(default_factory=list)
    compatibility: str = "INCOMPATIBLE"
    violations: list[ViolationDTO] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PlanResponse(ApiModel):
    request_id: str
    plan_id: str
    data_mode: str = "SYNTHETIC_DEMO"
    solver_status: str
    schedule: ScheduleDTO
    validation: ValidationDTO | None = None
    metrics: MetricsDTO | None = None
    explanations: ExplanationDTO | None = None
    candidates: list[CandidateDTO] = Field(default_factory=list)
    integrated_candidates: list[IntegratedBlockDTO] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    storage: str = "IN_MEMORY"


class CandidatesResponse(ApiModel):
    task_ids: list[str] = Field(default_factory=list)
    candidate_count: int = 0
    feasible_count: int = 0
    rejected_count: int = 0
    rejection_codes: dict[str, int] = Field(default_factory=dict)
    candidates: list[CandidateDTO] = Field(default_factory=list)
    data_mode: str = "SYNTHETIC_DEMO"
    storage: str = "IN_MEMORY"


class IntegratedBlocksResponse(ApiModel):
    task_ids: list[str] = Field(default_factory=list)
    groups_examined: int = 0
    compatible_count: int = 0
    rejection_codes: dict[str, int] = Field(default_factory=dict)
    candidates: list[IntegratedBlockDTO] = Field(default_factory=list)
    data_mode: str = "SYNTHETIC_DEMO"
    storage: str = "IN_MEMORY"


class ValidationResponse(ApiModel):
    schedule_id: str
    solver_status: str
    valid: bool
    error_count: int = Field(default=0, ge=0)
    warning_count: int = Field(default=0, ge=0)
    checked_block_count: int = Field(default=0, ge=0)
    checked_task_count: int = Field(default=0, ge=0)
    errors: list[ViolationDTO] = Field(default_factory=list)
    warnings: list[ViolationDTO] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PlanMetricsResponse(ApiModel):
    plan_id: str
    metrics: MetricsDTO


class PlanConflictsResponse(ApiModel):
    plan_id: str
    solver_status: str
    validation_valid: bool | None = None
    error_count: int = Field(default=0, ge=0)
    warning_count: int = Field(default=0, ge=0)
    errors: list[ViolationDTO] = Field(default_factory=list)
    warnings: list[ViolationDTO] = Field(default_factory=list)
    rejected_candidate_count: int = Field(default=0, ge=0)
    candidate_rejection_codes: dict[str, int] = Field(default_factory=dict)


class ErrorDetailDTO(ApiModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str | None = None


class ErrorResponse(ApiModel):
    error: ErrorDetailDTO


ApiViolation = ViolationDTO
ApiUnscheduledTask = UnscheduledTaskDTO
ApiSelectedBlock = SelectedBlockDTO
ApiSchedule = ScheduleDTO
ApiValidation = ValidationDTO
ApiMetrics = MetricsDTO
ApiExplanationRecord = ExplanationRecordDTO
ApiExplanation = ExplanationDTO
ApiExplanations = ExplanationDTO
ApiCandidate = CandidateDTO
ApiIntegratedBlock = IntegratedBlockDTO
ApiPlanResponse = PlanResponse
ApiCandidatesResponse = CandidatesResponse
ApiIntegratedBlocksResponse = IntegratedBlocksResponse
ApiValidationResponse = ValidationResponse
ApiPlanMetricsResponse = PlanMetricsResponse
ApiPlanConflictsResponse = PlanConflictsResponse

__all__ = [
    "ApiCandidate",
    "ApiCandidatesResponse",
    "ApiExplanation",
    "ApiExplanationRecord",
    "ApiExplanations",
    "ApiIntegratedBlock",
    "ApiIntegratedBlocksResponse",
    "ApiMetrics",
    "ApiModel",
    "ApiPlanConflictsResponse",
    "ApiPlanMetricsResponse",
    "ApiPlanResponse",
    "ApiSchedule",
    "ApiSelectedBlock",
    "ApiUnscheduledTask",
    "ApiValidation",
    "ApiValidationResponse",
    "ApiViolation",
    "CandidatesResponse",
    "CandidateDTO",
    "ErrorDetailDTO",
    "ErrorResponse",
    "ExplanationDTO",
    "ExplanationRecordDTO",
    "IntegratedBlockDTO",
    "IntegratedBlocksResponse",
    "MetricsDTO",
    "PlanConflictsResponse",
    "PlanMetricsResponse",
    "PlanResponse",
    "ScheduleDTO",
    "SelectedBlockDTO",
    "UnscheduledTaskDTO",
    "ValidationDTO",
    "ValidationResponse",
    "ViolationDTO",
]
