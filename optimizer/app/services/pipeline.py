"""Phase 7A orchestration: composes the existing pipeline services.

This module owns *composition only*. Every stage is delegated to the existing,
independently testable services — ``CandidateGenerator``, ``ConstraintEngine``
(inside the generator), ``IntegratedBlockDetector``, ``ScheduleOptimizer``,
``ScheduleValidator``, ``MetricsCalculator`` and ``ExplainabilityService``.
No constraint, solver, metric or explanation logic is reimplemented here.

Failures are reported as :class:`PipelineError` — transport-agnostic, carrying
a stable ``code`` — so the API layer can map them to HTTP status codes without
the services depending on HTTP.

Determinism: all stages are deterministic for identical input + configuration.
Plan IDs are derived from a canonical hash of the request payload, so an
identical request always maps to the same plan ID.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings, get_settings
from app.core.context import PlanningContext
from app.services.candidate_generator import CandidateGenerator
from app.services.explainability import ExplainabilityService
from app.services.integrated_block_detector import IntegratedBlockDetector
from app.services.metrics_calculator import MetricsCalculator
from app.services.schedule_optimizer import ScheduleOptimizer
from app.services.schedule_validator import ScheduleValidator
from contracts import (
    BlockCandidate,
    BlockRequest,
    ExplainabilityResult,
    IntegratedBlockCandidate,
    ScheduleMetrics,
    ScheduleResult,
    ScheduleValidationResult,
)


class PipelineError(Exception):
    """Transport-agnostic pipeline failure with a stable machine code."""

    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


# ------------------------------------------------------------------- outcomes


@dataclass
class CandidatesOutcome:
    """Result of single-task candidate generation for a task scope."""

    task_ids: list[str]
    candidates: list[BlockCandidate]
    settings: Settings

    @property
    def candidate_count(self) -> int:
        return len(self.candidates)

    @property
    def feasible_count(self) -> int:
        return sum(1 for candidate in self.candidates if not candidate.rejected)

    @property
    def rejected_count(self) -> int:
        return sum(1 for candidate in self.candidates if candidate.rejected)

    @property
    def rejection_codes(self) -> dict[str, int]:
        return counts_by(self.candidates)


@dataclass
class IntegratedOutcome:
    """Result of integrated-block discovery for a task scope."""

    task_ids: list[str]
    candidates: list[IntegratedBlockCandidate]
    settings: Settings

    @property
    def groups_examined(self) -> int:
        return len(self.candidates)

    @property
    def compatible_count(self) -> int:
        return sum(1 for candidate in self.candidates if candidate.compatible)

    @property
    def rejection_codes(self) -> dict[str, int]:
        return counts_by(self.candidates)


@dataclass
class GenerateOutcome:
    """Full pipeline result: schedule + validation + metrics + explanations."""

    plan_id: str
    request: BlockRequest
    context: PlanningContext
    result: ScheduleResult
    validation: ScheduleValidationResult
    metrics: ScheduleMetrics
    explanation: ExplainabilityResult
    candidates: list[BlockCandidate]
    integrated_candidates: list[IntegratedBlockCandidate]
    scope_task_ids: list[str]
    settings: Settings

    @property
    def rejected_candidate_count(self) -> int:
        return sum(1 for candidate in self.candidates if candidate.rejected)

    @property
    def candidate_rejection_codes(self) -> dict[str, int]:
        return counts_by(self.candidates)


@dataclass
class ValidationOutcome:
    """Independent validation result for a submitted schedule."""

    validation: ScheduleValidationResult


def counts_by(candidates: list[Any]) -> dict[str, int]:
    """Stable code->count summary over candidate rejection codes."""
    summary: dict[str, int] = {}
    for candidate in candidates:
        for code in candidate.rejection_codes:
            summary[code] = summary.get(code, 0) + 1
    return dict(sorted(summary.items()))


# ----------------------------------------------------------------- pipeline


class PlanBuilder:
    """Orchestrates the existing services into API consumable outcomes."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def settings(self) -> Settings:
        return self._settings

    # ------------------------------------------------------------- candidates

    def build_candidates(
        self,
        context,
        task_ids: list[str] | None = None,
        settings: Settings | None = None,
    ) -> CandidatesOutcome:
        settings = settings or self._settings
        ctx = self._coerce_context(context)
        scope = self._scope_ids(ctx, task_ids)
        tasks = [task for task in ctx.tasks if task.task_id in set(scope)]
        generator = CandidateGenerator(settings=settings)
        try:
            candidates = generator.generate_candidates(
                tasks, ctx.corridors, self._object_context(ctx)
            )
        except ValueError as exc:
            raise PipelineError(
                "CANDIDATE_GENERATION_FAILED",
                f"candidate generation failed for the requested scope: {exc}",
                {"task_ids": scope},
            ) from exc
        return CandidatesOutcome(task_ids=scope, candidates=candidates, settings=settings)

    # ------------------------------------------------------- integrated blocks

    def discover_integrated(
        self,
        context,
        task_ids: list[str] | None = None,
        settings: Settings | None = None,
    ) -> IntegratedOutcome:
        settings = settings or self._settings
        generated = self.build_candidates(context, task_ids, settings)
        ctx = self._coerce_context(context)
        feasible = CandidateGenerator.only_feasible(generated.candidates)
        detector = IntegratedBlockDetector(settings=settings)
        try:
            groups = detector.detect(feasible, ctx.corridors, self._object_context(ctx))
        except (ValueError, TypeError) as exc:
            raise PipelineError(
                "INTEGRATED_BLOCK_DETECTION_FAILED",
                f"integrated block detection failed for the requested scope: {exc}",
                {"task_ids": generated.task_ids},
            ) from exc
        return IntegratedOutcome(
            task_ids=generated.task_ids, candidates=groups, settings=settings
        )

    # ---------------------------------------------------------------- generate

    def generate(
        self,
        request,
        context,
        settings: Settings | None = None,
    ) -> GenerateOutcome:
        settings = settings or self._settings
        ctx = self._coerce_context(context)
        resolved_request, ctx = self._resolve_request(request, ctx)

        scope = self._scope_ids(ctx, list(resolved_request.task_ids))
        in_scope = [task for task in ctx.tasks if task.task_id in set(scope)]
        context_dict = self._object_context(ctx)

        generator = CandidateGenerator(settings=settings)
        try:
            candidates = generator.generate_candidates(
                in_scope, ctx.corridors, context_dict
            )
        except ValueError as exc:
            raise PipelineError(
                "CANDIDATE_GENERATION_FAILED",
                f"candidate generation failed for the requested scope: {exc}",
                {"task_ids": scope},
            ) from exc
        feasible = CandidateGenerator.only_feasible(candidates)

        detector = IntegratedBlockDetector(settings=settings)
        try:
            integrated = detector.detect(feasible, ctx.corridors, context_dict)
        except (ValueError, TypeError) as exc:
            raise PipelineError(
                "INTEGRATED_BLOCK_DETECTION_FAILED",
                f"integrated block detection failed for the requested scope: {exc}",
                {"task_ids": scope},
            ) from exc

        optimizer = ScheduleOptimizer(
            settings=settings,
            candidate_generator=generator,
            integrated_block_detector=detector,
        )
        result = optimizer.optimize(resolved_request, context_dict)

        validator = ScheduleValidator(settings=settings)
        validation = validator.validate(result, context_dict)

        meter = MetricsCalculator(settings=settings)
        metrics = meter.compute(result, context_dict, validation)

        explainer = ExplainabilityService(settings=settings)
        explanation = explainer.explain(
            result,
            context_dict,
            validation,
            metrics,
            candidates=list(candidates) + list(integrated),
        )

        plan_id = plan_id_for(resolved_request, ctx, settings)
        return GenerateOutcome(
            plan_id=plan_id,
            request=resolved_request,
            context=ctx,
            result=result,
            validation=validation,
            metrics=metrics,
            explanation=explanation,
            candidates=candidates,
            integrated_candidates=integrated,
            scope_task_ids=scope,
            settings=settings,
        )

    # --------------------------------------------------------------- validate

    def validate_schedule(
        self,
        schedule,
        context,
        settings: Settings | None = None,
    ) -> ValidationOutcome:
        settings = settings or self._settings
        ctx = self._coerce_context(context)
        if not ctx.tasks:
            raise PipelineError(
                "EMPTY_CONTEXT",
                "context contains no maintenance tasks; cannot validate against an empty world",
            )
        result = (
            schedule
            if isinstance(schedule, ScheduleResult)
            else ScheduleResult.model_validate(schedule)
        )
        validator = ScheduleValidator(settings=settings)
        return ValidationOutcome(
            validation=validator.validate(result, self._object_context(ctx))
        )

    # ----------------------------------------------------------------- helpers

    @staticmethod
    def _coerce_context(context) -> PlanningContext:
        if isinstance(context, PlanningContext):
            return context
        if hasattr(context, "model_dump"):
            return PlanningContext.from_dict(context.model_dump())
        return PlanningContext.from_dict(dict(context or {}))

    @staticmethod
    def _object_context(ctx: PlanningContext) -> dict:
        """Context dict whose values are native Python/contract objects.

        The existing services re-parse this via ``PlanningContext.from_dict``;
        ``MetricsCalculator`` additionally reads raw fields (``tasks``,
        ``horizon_start``, ...) directly and needs the object values, not the
        ``model_dump()`` dict form.
        """
        return {name: getattr(ctx, name) for name in PlanningContext.model_fields}

    @staticmethod
    def _scope_ids(ctx: PlanningContext, task_ids: list[str] | None) -> list[str]:
        context_ids = {task.task_id for task in ctx.tasks}
        if not context_ids:
            raise PipelineError(
                "EMPTY_CONTEXT",
                "planning context contains no maintenance tasks",
            )
        if task_ids is None:
            return sorted(context_ids)
        requested = [str(task_id) for task_id in task_ids]
        if not requested:
            raise PipelineError(
                "EMPTY_SCOPE",
                "an empty task scope was supplied; provide at least one task id",
            )
        unknown = sorted(set(requested) - context_ids)
        if unknown:
            raise PipelineError(
                "UNKNOWN_TASK_REFERENCED",
                f"task ids absent from the planning context: {', '.join(unknown)}",
                {"unknown_task_ids": unknown},
            )
        return sorted(set(requested))

    @staticmethod
    def _resolve_request(
        request, ctx: PlanningContext
    ) -> tuple[BlockRequest, PlanningContext]:
        if request is not None:
            resolved = (
                request
                if isinstance(request, BlockRequest)
                else BlockRequest.model_validate(request)
            )
        elif len(ctx.block_requests) == 1:
            resolved = ctx.block_requests[0]
        else:
            raise PipelineError(
                "REQUEST_REQUIRED",
                "an optimization request is required: pass `request` in the body, "
                "or provide exactly one block_request in the context",
                {"block_request_count": len(ctx.block_requests)},
            )
        existing_ids = {br.request_id for br in ctx.block_requests}
        if resolved.request_id not in existing_ids:
            ctx = ctx.model_copy(
                update={"block_requests": [*ctx.block_requests, resolved]}
            )
        return resolved, ctx


def plan_id_for(request: BlockRequest, ctx: PlanningContext, settings: Settings) -> str:
    """Deterministic plan id from a canonical hash of the request payload."""
    payload = json.dumps(
        {
            "request": request.model_dump(mode="json"),
            "context": ctx.model_dump(mode="json"),
            "settings": settings.model_dump(mode="json"),
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest().upper()
    return f"PLAN-{digest[:16]}"


__all__ = [
    "CandidatesOutcome",
    "GenerateOutcome",
    "IntegratedOutcome",
    "PlanBuilder",
    "PipelineError",
    "ValidationOutcome",
    "counts_by",
    "plan_id_for",
]