"""REST endpoints for the Module 3 optimization pipeline."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.api.dto_mappers import (
    to_candidates_response,
    to_internal_schedule,
    to_integrated_blocks_response,
    to_plan_conflicts_response,
    to_plan_metrics_response,
    to_plan_response,
    to_validation_response,
)
from app.api.errors import ApiError, error_responses
from app.api.plan_store import InMemoryPlanStore
from app.core.config import Settings
from app.schemas.optimizer import (
    CandidatesRequest,
    CandidatesResponse,
    DiscoverRequest,
    IntegratedBlocksResponse,
    ModelSettings,
    OptimizeRequest,
    PlanConflictsResponse,
    PlanMetricsResponse,
    PlanResponse,
    ValidateRequest,
    ValidationResponse,
)
from app.services.pipeline import PipelineError, PlanBuilder

router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])

#: Per-route OpenAPI error envelopes. Each route documents only the statuses it
#: can actually return, and every one of them carries the stable
#: :class:`~app.schemas.api.ErrorResponse` shape.
_WRITE_ERRORS = error_responses(400, 422, 500)
_READ_ERRORS = error_responses(404, 422, 500)
_READ_VIEW_ERRORS = error_responses(404, 409, 422, 500)


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _pipeline(request: Request) -> PlanBuilder:
    return request.app.state.pipeline


def _store(request: Request) -> InMemoryPlanStore:
    return request.app.state.plan_store


def _request_id(request: Request) -> str | None:
    value = request.headers.get("x-request-id")
    return value.strip() if isinstance(value, str) and value.strip() else None


def _payload_request_id(payload: Any) -> str | None:
    request = getattr(payload, "request", None)
    value = getattr(request, "request_id", None)
    if value:
        return str(value)
    context = getattr(payload, "context", None)
    requests = getattr(context, "block_requests", None) or []
    if requests:
        value = getattr(requests[0], "request_id", None)
        if value:
            return str(value)
    return None


def resolve_override(override: ModelSettings | None, base: Settings) -> Settings:
    """Fold a per-request settings override into the application settings."""
    return override.resolve(base) if override is not None else base


def _is_client_error(code: str) -> bool:
    return code in {
        "EMPTY_CONTEXT",
        "EMPTY_SCOPE",
        "UNKNOWN_TASK_REFERENCED",
        "REQUEST_REQUIRED",
        "CANDIDATE_GENERATION_FAILED",
        "INTEGRATED_BLOCK_DETECTION_FAILED",
    }


def _raise_pipeline(exc: PipelineError, request_id: str | None = None) -> None:
    status = 400 if _is_client_error(exc.code) else 500
    raise ApiError(status, exc.code, exc.message, exc.details, request_id) from exc


def _get_plan_or_404(plan_id: str, request: Request) -> PlanResponse:
    plan = _store(request).get(plan_id)
    if plan is None:
        raise ApiError(
            404,
            "NOT_FOUND",
            f"plan '{plan_id}' does not exist in the in-memory plan store",
            request_id=_request_id(request),
        )
    return plan


@router.post(
    "/candidates",
    response_model=CandidatesResponse,
    response_description="Generated block candidates for the requested task scope",
    summary="Generate block candidates",
    responses=_WRITE_ERRORS,
)
def generate_candidates(payload: CandidatesRequest, request: Request) -> CandidatesResponse:
    settings = resolve_override(payload.settings, _settings(request))
    try:
        outcome = _pipeline(request).build_candidates(
            payload.context, payload.task_ids, settings
        )
    except PipelineError as exc:
        _raise_pipeline(exc, _payload_request_id(payload) or _request_id(request))
    return to_candidates_response(outcome)


@router.post(
    "/integrated-blocks/discover",
    response_model=IntegratedBlocksResponse,
    response_description="Discovered integrated-block groups for the requested task scope",
    summary="Discover integrated blocks",
    responses=_WRITE_ERRORS,
)
def discover_integrated_blocks(
    payload: DiscoverRequest, request: Request
) -> IntegratedBlocksResponse:
    settings = resolve_override(payload.settings, _settings(request))
    try:
        outcome = _pipeline(request).discover_integrated(
            payload.context, payload.task_ids, settings
        )
    except PipelineError as exc:
        _raise_pipeline(exc, _payload_request_id(payload) or _request_id(request))
    return to_integrated_blocks_response(outcome)


@router.post(
    "/generate",
    response_model=PlanResponse,
    response_description="Optimized plan: schedule, validation, metrics, explanations and candidates",
    summary="Generate and store an optimized plan",
    responses=_WRITE_ERRORS,
)
def generate_plan(payload: OptimizeRequest, request: Request) -> PlanResponse:
    settings = resolve_override(payload.settings, _settings(request))
    try:
        outcome = _pipeline(request).generate(
            payload.request, payload.context, settings
        )
    except PipelineError as exc:
        _raise_pipeline(exc, _payload_request_id(payload) or _request_id(request))
    plan = to_plan_response(outcome)
    _store(request).put(plan)
    return plan


@router.post(
    "/validate",
    response_model=ValidationResponse,
    response_description="Independent validation of the submitted schedule (never runs the optimizer)",
    summary="Validate a schedule",
    responses=_WRITE_ERRORS,
)
def validate_schedule(payload: ValidateRequest, request: Request) -> ValidationResponse:
    settings = resolve_override(None, _settings(request))
    try:
        outcome = _pipeline(request).validate_schedule(
            to_internal_schedule(payload.schedule), payload.context, settings
        )
    except PipelineError as exc:
        _raise_pipeline(exc, _request_id(request))
    return to_validation_response(outcome.validation)


@router.get(
    "/plans/{plan_id}",
    response_model=PlanResponse,
    response_description="The stored plan",
    summary="Get a stored plan",
    responses=_READ_ERRORS,
)
def get_plan(plan_id: str, request: Request) -> PlanResponse:
    return _get_plan_or_404(plan_id, request)


@router.get(
    "/plans/{plan_id}/metrics",
    response_model=PlanMetricsResponse,
    response_description="KPI snapshot for the stored plan",
    summary="Get plan metrics",
    responses=_READ_VIEW_ERRORS,
)
def get_plan_metrics(plan_id: str, request: Request) -> PlanMetricsResponse:
    plan = _get_plan_or_404(plan_id, request)
    if plan.metrics is None:
        raise ApiError(
            409,
            "PLAN_METRICS_UNAVAILABLE",
            f"plan '{plan_id}' has no metrics; regenerate the plan",
            request_id=_request_id(request),
        )
    return to_plan_metrics_response(plan)


@router.get(
    "/plans/{plan_id}/conflicts",
    response_model=PlanConflictsResponse,
    response_description="Conflict and candidate-rejection summary for the stored plan",
    summary="Get plan conflicts",
    responses=_READ_VIEW_ERRORS,
)
def get_plan_conflicts(plan_id: str, request: Request) -> PlanConflictsResponse:
    plan = _get_plan_or_404(plan_id, request)
    if plan.validation is None:
        raise ApiError(
            409,
            "PLAN_VALIDATION_UNAVAILABLE",
            f"plan '{plan_id}' has no validation result; regenerate the plan",
            request_id=_request_id(request),
        )
    return to_plan_conflicts_response(plan)


__all__ = ["router"]
