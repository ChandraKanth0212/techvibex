"""Mappings between internal pipeline results and stable API DTOs."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from enum import Enum
from math import isfinite
from typing import Any

from app.schemas.api import (
    CandidatesResponse,
    CandidateDTO,
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
from contracts import (
    ScheduleBlock,
    ScheduleResult,
    TaskSchedulingInfo,
)

_RUNTIME_METADATA_KEYS = frozenset(
    {
        "solve_time_seconds",
        "presolve_solve_time_seconds",
        "wall_time_seconds",
        "runtime_seconds",
        "elapsed_seconds",
        "solve_duration_seconds",
        "timed_out",
        "generated_at",
        "created_at",
    }
)
_MISSING = object()


def _get(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, Mapping):
        return value.get(name, default)
    return getattr(value, name, default)


def _mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    if hasattr(value, "model_dump"):
        return dict(value.model_dump(mode="python"))
    return {}


def _text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


def _integer(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _number(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if isfinite(result) else default


def _boolean(value: Any, default: bool = False) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if value is None:
        return default
    return bool(value)


def _strings(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple, set, frozenset)):
        values = [_text(item) for item in value if item is not None]
    else:
        values = [_text(value)]
    return sorted(dict.fromkeys(values))


def _safe_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if isfinite(value) else None
    if isinstance(value, Enum):
        return _safe_value(value.value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Mapping):
        result: dict[str, Any] = {}
        for key in sorted(value, key=lambda item: str(item)):
            converted = _safe_value(value[key])
            if converted is not _MISSING:
                result[str(key)] = converted
        return result
    if isinstance(value, (list, tuple, set, frozenset)):
        items = value
        if isinstance(value, (set, frozenset)):
            items = sorted(value, key=lambda item: str(item))
        result_list = []
        for item in items:
            converted = _safe_value(item)
            if converted is not _MISSING:
                result_list.append(converted)
        return result_list
    return _MISSING


def _safe_mapping(value: Any) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    result: dict[str, Any] = {}
    for key in sorted(value, key=lambda item: str(item)):
        converted = _safe_value(value[key])
        if converted is not _MISSING:
            result[str(key)] = converted
    return result


def _stable_solver_metadata(value: Any) -> dict[str, Any]:
    safe = _safe_mapping(value)
    return {key: item for key, item in safe.items() if key not in _RUNTIME_METADATA_KEYS}


def _span_minutes(start: Any, end: Any) -> int:
    if isinstance(start, str):
        try:
            start = datetime.fromisoformat(start)
        except ValueError:
            return 0
    if isinstance(end, str):
        try:
            end = datetime.fromisoformat(end)
        except ValueError:
            return 0
    if not isinstance(start, datetime) or not isinstance(end, datetime):
        return 0
    return max(0, int((end - start).total_seconds() // 60))


def _duration(raw: Mapping[str, Any], start: Any = None, end: Any = None) -> int:
    value = raw.get("duration_minutes")
    if value is None:
        value = raw.get("total_duration_minutes")
    if value is None:
        value = raw.get("shared_possession_minutes")
    if value is None:
        return _span_minutes(start, end)
    return max(0, _integer(value))


def to_violation_dto(value: Any) -> ViolationDTO:
    raw = _mapping(value)
    return ViolationDTO(
        code=_text(raw.get("code") or raw.get("violation_code")),
        severity=_text(raw.get("severity"), "ERROR"),
        message=_text(raw.get("message")),
        affected_ids=_strings(raw.get("affected_ids")),
        reason=_text(raw.get("reason")),
    )


def _context_collections(context: Any) -> tuple[list[Any], list[Any]]:
    raw = _mapping(context)
    tasks = _get(context, "tasks", raw.get("tasks")) or []
    requests = _get(context, "block_requests", raw.get("block_requests")) or []
    return list(tasks), list(requests)


def _task_details(context: Any, task_ids: list[str]) -> tuple[list[str], list[str], list[str]]:
    tasks, requests = _context_collections(context)
    selected = set(task_ids)
    departments: set[str] = set()
    resources: set[str] = set()
    request_ids: set[str] = set()
    for task in tasks:
        task_id = _text(_get(task, "task_id"))
        if task_id not in selected:
            continue
        department = _get(task, "department")
        if not department:
            metadata = _mapping(_get(task, "metadata"))
            department = metadata.get("department")
        if department:
            departments.add(_text(department))
        resources.update(_strings(_get(task, "required_resources")))
    for request in requests:
        request_task_ids = set(_strings(_get(request, "task_ids")))
        if request_task_ids & selected:
            request_id = _get(request, "request_id")
            if request_id:
                request_ids.add(_text(request_id))
    return sorted(departments), sorted(resources), sorted(request_ids)


def to_selected_block_dto(value: Any, context: Any = None) -> SelectedBlockDTO:
    raw = _mapping(value)
    task_ids = _strings(raw.get("task_ids"))
    block_type = _text(raw.get("block_type"))
    integrated = _boolean(raw.get("integrated"), block_type.upper() == "INTEGRATED")
    departments, resources, request_ids = _task_details(context, task_ids)
    if not departments:
        departments = _strings(raw.get("participating_departments"))
    if not resources:
        resources = _strings(raw.get("resources"))
    if not request_ids:
        request_ids = _strings(raw.get("request_ids"))
    start = raw.get("start_time")
    end = raw.get("end_time")
    return SelectedBlockDTO(
        block_id=_text(raw.get("block_id")),
        task_ids=task_ids,
        request_ids=request_ids,
        corridor_id=_text(raw.get("corridor_id")),
        section=_text(raw.get("section")),
        start_time=start,
        end_time=end,
        duration_minutes=_duration(raw, start, end),
        integrated=integrated,
        participating_departments=departments,
        resources=resources,
        status=_text(raw.get("status"), "SCHEDULED"),
        block_type=block_type or ("INTEGRATED" if integrated else "SINGLE"),
    )


def to_unscheduled_task_dto(value: Any) -> UnscheduledTaskDTO:
    raw = _mapping(value)
    return UnscheduledTaskDTO(
        task_id=_text(raw.get("task_id")),
        scheduled=_boolean(raw.get("scheduled")),
        reason=_text(raw.get("reason")),
        candidate_count=max(0, _integer(raw.get("candidate_count"))),
        feasible_candidate_count=max(0, _integer(raw.get("feasible_candidate_count"))),
        rejection_codes=_strings(raw.get("rejection_codes")),
        metadata=_safe_mapping(raw.get("metadata")),
    )


def to_schedule_dto(value: Any, context: Any = None) -> ScheduleDTO:
    if isinstance(value, ScheduleDTO):
        return value
    raw = _mapping(value)
    blocks = sorted(
        (to_selected_block_dto(block, context) for block in (raw.get("selected_blocks") or [])),
        key=lambda block: block.block_id,
    )
    unscheduled = sorted(
        (to_unscheduled_task_dto(item) for item in (raw.get("unscheduled_tasks") or [])),
        key=lambda item: item.task_id,
    )
    scheduled_ids = sorted(_strings(raw.get("scheduled_task_ids")))
    unscheduled_ids = sorted(_strings(raw.get("unscheduled_task_ids")))
    start = raw.get("start_time")
    return ScheduleDTO(
        schedule_id=_text(raw.get("schedule_id")),
        status=_text(raw.get("status")),
        message=_text(raw.get("message")),
        objective_value=_number(raw.get("objective_value")),
        scheduled_task_ids=scheduled_ids,
        unscheduled_task_ids=unscheduled_ids,
        unscheduled_tasks=unscheduled,
        selected_blocks=blocks,
        solver_metadata=_stable_solver_metadata(raw.get("solver_metadata")),
    )


def to_validation_dto(value: Any) -> ValidationDTO | None:
    if value is None:
        return None
    if isinstance(value, ValidationDTO):
        return value
    raw = _mapping(value)
    return ValidationDTO(
        schedule_id=_text(raw.get("schedule_id")),
        solver_status=_text(raw.get("solver_status")),
        valid=_boolean(raw.get("valid")),
        errors=[to_violation_dto(item) for item in (raw.get("errors") or [])],
        warnings=[to_violation_dto(item) for item in (raw.get("warnings") or [])],
        checked_block_count=max(0, _integer(raw.get("checked_block_count"))),
        checked_task_count=max(0, _integer(raw.get("checked_task_count"))),
        metadata=_safe_mapping(raw.get("metadata")),
    )


def to_metrics_dto(value: Any) -> MetricsDTO | None:
    if value is None:
        return None
    if isinstance(value, MetricsDTO):
        return value
    raw = _mapping(value)
    accuracy = raw.get("validation_accuracy_percent")
    return MetricsDTO(
        total_tasks_requested=max(0, _integer(raw.get("total_tasks_requested"))),
        total_tasks_scheduled=max(0, _integer(raw.get("total_tasks_scheduled"))),
        task_coverage_ratio=_number(raw.get("task_coverage_ratio")),
        integrated_blocks_count=max(0, _integer(raw.get("integrated_blocks_count"))),
        block_consolidation_ratio=_number(raw.get("block_consolidation_ratio")),
        average_possession_minutes=_number(raw.get("average_possession_minutes")),
        slot_utilisation_percent=_number(raw.get("slot_utilisation_percent")),
        resource_utilisation_percent=_number(raw.get("resource_utilisation_percent")),
        scheduled_urgent_tasks=max(0, _integer(raw.get("scheduled_urgent_tasks"))),
        unscheduled_urgent_tasks=max(0, _integer(raw.get("unscheduled_urgent_tasks"))),
        conflicts_resolved=max(0, _integer(raw.get("conflicts_resolved"))),
        validation_accuracy_percent=None if accuracy is None else _number(accuracy),
        extra=_safe_mapping(raw.get("extra")),
    )


def to_explanation_record_dto(value: Any) -> ExplanationRecordDTO:
    raw = _mapping(value)
    return ExplanationRecordDTO(
        subject_id=_text(raw.get("subject_id")),
        subject_type=_text(raw.get("subject_type")),
        status=_text(raw.get("status")),
        reason_codes=_strings(raw.get("reason_codes")),
        summary=_text(raw.get("summary")),
        details=_strings(raw.get("details")),
        evidence=_safe_mapping(raw.get("evidence")),
        metadata=_safe_mapping(raw.get("metadata")),
    )


def to_explanation_dto(value: Any) -> ExplanationDTO | None:
    if value is None:
        return None
    if isinstance(value, ExplanationDTO):
        return value
    raw = _mapping(value)
    return ExplanationDTO(
        schedule_id=_text(raw.get("schedule_id")),
        solver_status=_text(raw.get("solver_status")),
        schedule_valid=raw.get("schedule_valid"),
        validation_provided=_boolean(raw.get("validation_provided")),
        records=[to_explanation_record_dto(item) for item in (raw.get("records") or [])],
        metadata=_safe_mapping(raw.get("metadata")),
    )


def to_candidate_dto(value: Any) -> CandidateDTO:
    if isinstance(value, CandidateDTO):
        return value
    raw = _mapping(value)
    rejected = _boolean(raw.get("rejected"))
    start = raw.get("start_time")
    end = raw.get("end_time")
    return CandidateDTO(
        candidate_id=_text(raw.get("candidate_id")),
        task_ids=_strings(raw.get("task_ids")),
        corridor_id=_text(raw.get("corridor_id")),
        section=_text(raw.get("section")),
        start_time=start,
        end_time=end,
        duration_minutes=_duration(raw, start, end),
        feasible=_boolean(raw.get("feasible"), not rejected),
        rejected=rejected,
        violations=[to_violation_dto(item) for item in (raw.get("violations") or [])],
        metadata=_safe_mapping(raw.get("metadata")),
    )


def to_integrated_block_dto(value: Any) -> IntegratedBlockDTO:
    if isinstance(value, IntegratedBlockDTO):
        return value
    raw = _mapping(value)
    start = raw.get("window_start") or raw.get("earliest_feasible_start")
    end = raw.get("window_end") or raw.get("latest_feasible_end")
    return IntegratedBlockDTO(
        block_id=_text(raw.get("block_id")),
        task_ids=_strings(raw.get("task_ids")),
        request_ids=_strings(raw.get("request_ids")),
        corridor_id=_text(raw.get("corridor_id")),
        section=_text(raw.get("section")),
        window_start=raw.get("window_start"),
        window_end=raw.get("window_end"),
        earliest_feasible_start=raw.get("earliest_feasible_start"),
        latest_feasible_end=raw.get("latest_feasible_end"),
        total_required_duration_minutes=_duration(raw, start, end),
        participating_departments=_strings(raw.get("participating_departments")),
        compatibility=_text(raw.get("compatibility"), "INCOMPATIBLE"),
        violations=[to_violation_dto(item) for item in (raw.get("violations") or [])],
        metadata=_safe_mapping(raw.get("metadata")),
    )


def to_internal_schedule(value: Any) -> ScheduleResult:
    schedule = value if isinstance(value, ScheduleDTO) else ScheduleDTO.model_validate(value)
    blocks: list[ScheduleBlock] = []
    for block in schedule.selected_blocks:
        duration = block.duration_minutes or _span_minutes(block.start_time, block.end_time)
        block_type = (block.block_type or ("INTEGRATED" if block.integrated else "SINGLE")).upper()
        if block_type not in {"SINGLE", "INTEGRATED"}:
            block_type = "INTEGRATED" if block.integrated else "SINGLE"
        blocks.append(
            ScheduleBlock(
                block_id=block.block_id,
                task_ids=list(block.task_ids),
                corridor_id=block.corridor_id,
                section=block.section,
                start_time=block.start_time,
                end_time=block.end_time,
                block_type=block_type,
                total_duration_minutes=max(1, duration),
                metadata={},
            )
        )
    infos = [
        TaskSchedulingInfo(
            task_id=item.task_id,
            scheduled=item.scheduled,
            reason=item.reason,
            candidate_count=item.candidate_count,
            feasible_candidate_count=item.feasible_candidate_count,
            rejection_codes=list(item.rejection_codes),
            metadata=dict(item.metadata),
        )
        for item in schedule.unscheduled_tasks
    ]
    return ScheduleResult(
        schedule_id=schedule.schedule_id,
        status=schedule.status,
        message=schedule.message,
        selected_blocks=blocks,
        scheduled_task_ids=list(schedule.scheduled_task_ids),
        unscheduled_task_ids=list(schedule.unscheduled_task_ids),
        unscheduled_tasks=infos,
        objective_value=schedule.objective_value,
        solver_metadata=dict(schedule.solver_metadata),
    )


def to_candidates_response(outcome: Any) -> CandidatesResponse:
    return CandidatesResponse(
        task_ids=list(outcome.task_ids),
        candidate_count=outcome.candidate_count,
        feasible_count=outcome.feasible_count,
        rejected_count=outcome.rejected_count,
        rejection_codes=dict(outcome.rejection_codes),
        candidates=[to_candidate_dto(item) for item in outcome.candidates],
        data_mode=_text(outcome.settings.data_mode),
        storage="IN_MEMORY",
    )


def to_integrated_blocks_response(outcome: Any) -> IntegratedBlocksResponse:
    return IntegratedBlocksResponse(
        task_ids=list(outcome.task_ids),
        groups_examined=outcome.groups_examined,
        compatible_count=outcome.compatible_count,
        rejection_codes=dict(outcome.rejection_codes),
        candidates=[to_integrated_block_dto(item) for item in outcome.candidates],
        data_mode=_text(outcome.settings.data_mode),
        storage="IN_MEMORY",
    )


def to_plan_response(outcome: Any) -> PlanResponse:
    result = outcome.result
    return PlanResponse(
        request_id=_text(_get(outcome.request, "request_id")),
        plan_id=_text(outcome.plan_id),
        data_mode=_text(outcome.settings.data_mode),
        solver_status=_text(_get(result, "status")),
        schedule=to_schedule_dto(result, outcome.context),
        validation=to_validation_dto(outcome.validation),
        metrics=to_metrics_dto(outcome.metrics),
        explanations=to_explanation_dto(outcome.explanation),
        candidates=[to_candidate_dto(item) for item in outcome.candidates],
        integrated_candidates=[to_integrated_block_dto(item) for item in outcome.integrated_candidates],
        meta={"scope_task_ids": list(outcome.scope_task_ids)},
        storage="IN_MEMORY",
    )


def to_validation_response(validation: Any) -> ValidationResponse:
    value = to_validation_dto(validation)
    if value is None:
        raise ValueError("validation result is required")
    return ValidationResponse(
        schedule_id=value.schedule_id,
        solver_status=value.solver_status,
        valid=value.valid,
        error_count=len(value.errors),
        warning_count=len(value.warnings),
        checked_block_count=value.checked_block_count,
        checked_task_count=value.checked_task_count,
        errors=value.errors,
        warnings=value.warnings,
        metadata=dict(value.metadata),
    )


def to_plan_metrics_response(plan: PlanResponse) -> PlanMetricsResponse:
    if plan.metrics is None:
        raise ValueError("plan metrics are required")
    return PlanMetricsResponse(plan_id=plan.plan_id, metrics=plan.metrics)


def to_plan_conflicts_response(plan: PlanResponse) -> PlanConflictsResponse:
    validation = plan.validation
    if validation is None:
        raise ValueError("plan validation is required")
    return PlanConflictsResponse(
        plan_id=plan.plan_id,
        solver_status=plan.solver_status,
        validation_valid=validation.valid,
        error_count=len(validation.errors),
        warning_count=len(validation.warnings),
        errors=validation.errors,
        warnings=validation.warnings,
        rejected_candidate_count=sum(1 for candidate in plan.candidates if candidate.rejected),
        candidate_rejection_codes=_candidate_rejection_codes(plan.candidates),
    )


def _candidate_rejection_codes(candidates: list[CandidateDTO]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for candidate in candidates:
        for violation in candidate.violations:
            if violation.severity.upper() != "ERROR":
                continue
            summary[violation.code] = summary.get(violation.code, 0) + 1
    return dict(sorted(summary.items()))


__all__ = [
    "to_candidate_dto",
    "to_candidates_response",
    "to_explanation_dto",
    "to_explanation_record_dto",
    "to_integrated_block_dto",
    "to_integrated_blocks_response",
    "to_internal_schedule",
    "to_metrics_dto",
    "to_plan_conflicts_response",
    "to_plan_metrics_response",
    "to_plan_response",
    "to_schedule_dto",
    "to_selected_block_dto",
    "to_unscheduled_task_dto",
    "to_validation_dto",
    "to_validation_response",
    "to_violation_dto",
]
