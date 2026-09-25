"""Phase 7A REST endpoints for the optimization pipeline.

Routes are thin: every request is delegated to the :class:`PlanBuilder`
orchestration service (``app/services/pipeline.py``) which composes the
existing, independently testable services. No constraint, solver, metric or
explanation logic lives in this module.
"""

from __future__ import annotations

from fastapi import APIRouter, FastAPI, Request

from app.api.errors import ApiError
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
from app.services.pipeline import (
    GenerateOutcome,
    PipelineError,
    PlanBuilder,
    counts_by,
)

router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])


# ---------------------------------------------------------------- dependencies

def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _pipeline(request: Request) -> PlanBuilder:
    return request.app.state.pipeline


def _store(request: Request) -> InMemoryPlanStore:
    return request.app.state.plan_store


def resolve_override(override: ModelSettings | None, base: Settings) -> Settings:
    """Fold a per-request settings override into the application settings."""
    return override.resolve(base) if override is not None else base


def _raise_pipeline(exc: PipelineError) -> None:
    """Transport-agnostic pipeline failure -> structured HTTP error."""
    status = 400 if _is_client_error(exc.code) else 500
    raise ApiError(status, exc.code, exc.message, exc.details) from exc


def _is_client_error(code: str) -> bool:
    return code in {
        "EMPTY_CONTEXT",
        "EMPTY_SCOPE",
        "UNKNOWN_TASK_REFERENCED",
        "REQUEST_REQUIRED",
        "CANDIDATE_GENERATION_FAILED",
        "INTEGRATED_BLOCK_DETECTION_FAILED",
    }


def _get_plan_or_404(plan_id: str, request: Request):
    plan = _store(request).get(plan_id)
    if plan is None:
        raise ApiError(
            404,
            "NOT_FOUND",
            f"plan '{plan_id}' does not exist in the in-memory plan store",
        )
    return plan


#: Solver metadata keys that measure this particular run (wall-clock) and would
#: break the determinism contract if copied verbatim into a stored plan. Matches
#: the Phase 6 explainability policy.
_TIMING_METADATA_KEYS = frozenset(
    {
        "solve_time_seconds",
        "presolve_solve_time_seconds",
        "wall_time_seconds",
        "runtime_seconds",
    }
)


def _stable_schedule(schedule: ScheduleResult) -> ScheduleResult:
    """Return the schedule with run-wall-clock solver metadata removed."""
    metadata = schedule.solver_metadata or {}
    cleaned = {
        key: value for key, value in metadata.items() if key not in _TIMING_METADATA_KEYS
    }
    if len(cleaned) == len(metadata):
        return schedule
    return schedule.model_copy(update={"solver_metadata": cleaned})


def _to_plan_response(outcome: GenerateOutcome) -> PlanResponse:
    return PlanResponse(
        plan_id=outcome.plan_id,
        data_mode=outcome.settings.data_mode.value,
        storage="IN_MEMORY",
        request_id=outcome.request.request_id,
        solver_status=outcome.result.status,
        schedule=_stable_schedule(outcome.result),
        validation=outcome.validation,
        metrics=outcome.metrics,
        explanations=outcome.explanation,
        candidates=outcome.candidates,
        integrated_candidates=outcome.integrated_candidates,
        meta={"scope_task_ids": list(outcome.scope_task_ids)},
    )


# ------------------------------------------------------------------- endpoints

@router.post("/candidates", response_model=CandidatesResponse)
def generate_candidates(payload: CandidatesRequest, request: Request) -> CandidatesResponse:
    settings = resolve_override(payload.settings, _settings(request))
    try:
        outcome = _pipeline(request).build_candidates(
            payload.context, payload.task_ids, settings
        )
    except PipelineError as exc:
        _raise_pipeline(exc)
    return CandidatesResponse(
        task_ids=outcome.task_ids,
        candidate_count=outcome.candidate_count,
        feasible_count=outcome.feasible_count,
        rejected_count=outcome.rejected_count,
        rejection_codes=outcome.rejection_codes,
        candidates=outcome.candidates,
        data_mode=outcome.settings.data_mode.value,
        storage="IN_MEMORY",
    )


@router.post("/integrated-blocks/discover", response_model=IntegratedBlocksResponse)
def discover_integrated_blocks(
    payload: DiscoverRequest, request: Request
) -> IntegratedBlocksResponse:
    settings = resolve_override(payload.settings, _settings(request))
    try:
        outcome = _pipeline(request).discover_integrated(
            payload.context, payload.task_ids, settings
        )
    except PipelineError as exc:
        _raise_pipeline(exc)
    return IntegratedBlocksResponse(
        task_ids=outcome.task_ids,
        groups_examined=outcome.groups_examined,
        compatible_count=outcome.compatible_count,
        rejection_codes=outcome.rejection_codes,
        candidates=outcome.candidates,
        data_mode=outcome.settings.data_mode.value,
        storage="IN_MEMORY",
    )


@router.post("/generate", response_model=PlanResponse)
def generate_plan(payload: OptimizeRequest, request: Request) -> PlanResponse:
    settings = resolve_override(payload.settings, _settings(request))
    try:
        outcome = _pipeline(request).generate(
            payload.request, payload.context, settings
        )
    except PipelineError as exc:
        _raise_pipeline(exc)
    plan = _to_plan_response(outcome)
    _store(request).put(plan)
    return plan


@router.post("/validate", response_model=ValidationResponse)
def validate_schedule(payload: ValidateRequest, request: Request) -> ValidationResponse:
    settings = resolve_override(None, _settings(request))
    try:
        outcome = _pipeline(request).validate_schedule(
            payload.schedule, payload.context, settings
        )
    except PipelineError as exc:
        _raise_pipeline(exc)
    validation = outcome.validation
    return ValidationResponse(
        schedule_id=validation.schedule_id,
        solver_status=validation.solver_status,
        valid=validation.valid,
        error_count=len(validation.errors),
        warning_count=len(validation.warnings),
        checked_block_count=validation.checked_block_count,
        checked_task_count=validation.checked_task_count,
        errors=validation.errors,
        warnings=validation.warnings,
        metadata=dict(validation.metadata or {}),
    )


@router.get("/plans/{plan_id}", response_model=PlanResponse)
def get_plan(plan_id: str, request: Request) -> PlanResponse:
    return _get_plan_or_404(plan_id, request)


@router.get("/plans/{plan_id}/metrics", response_model=PlanMetricsResponse)
def get_plan_metrics(plan_id: str, request: Request) -> PlanMetricsResponse:
    plan = _get_plan_or_404(plan_id, request)
    if plan.metrics is None:
        raise ApiError(
            409,
            "PLAN_METRICS_UNAVAILABLE",
            f"plan '{plan_id}' has no metrics; regenerate the plan",
        )
    return PlanMetricsResponse(plan_id=plan.plan_id, metrics=plan.metrics)


@router.get("/plans/{plan_id}/conflicts", response_model=PlanConflictsResponse)
def get_plan_conflicts(plan_id: str, request: Request) -> PlanConflictsResponse:
    plan = _get_plan_or_404(plan_id, request)
    if plan.validation is None:
        raise ApiError(
            409,
            "PLAN_VALIDATION_UNAVAILABLE",
            f"plan '{plan_id}' has no validation result; regenerate the plan",
        )
    validation = plan.validation
    return PlanConflictsResponse(
        plan_id=plan.plan_id,
        solver_status=plan.solver_status,
        validation_valid=validation.valid,
        error_count=len(validation.errors),
        warning_count=len(validation.warnings),
        errors=validation.errors,
        warnings=validation.warnings,
        rejected_candidate_count=sum(
            1 for candidate in plan.candidates if candidate.rejected
        ),
        candidate_rejection_codes=counts_by(plan.candidates),
    )


__all__ = ["router"]