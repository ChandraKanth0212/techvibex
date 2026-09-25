"""Deterministic hard-constraint validation engine.

Implements the :class:`app.services.ConstraintEngine` interface for the
constraint categories the Phase 1 contract schemas can actually evaluate.

Rules derived from configuration (never hard-coded in business logic):

- safety buffer for protected train movements  -> ``settings.safety_buffer_minutes``
- goods forecast thresholds                    -> ``settings.goods_forecast_probability_threshold``,
                                                  ``settings.goods_forecast_peak_threshold``

Guiding principles:

- a conflict is reported ONLY when the supplied data supports it; optional data
  that is absent (empty lists / ``None``) disables the corresponding check;
- POWER_CONFLICT and DEPENDENCY_CONFLICT are intentionally unsupported because
  the current schemas carry no power-isolation or dependency fields
  (see ``app.constraints.codes.UNSUPPORTED_CONFLICT_CODES``).

The engine is deliberately free of FastAPI concerns and is reused later by the
candidate generator, integrated-block detection, the CP-SAT optimizer and the
independent schedule validator.
"""

from datetime import timedelta

from app.constraints.codes import (
    ACTIVE_BLOCK_STATUSES,
    SUPPORTED_CONFLICT_CODES,
    UNSUPPORTED_CONFLICT_CODES,
    ConflictCode,
)
from app.core.config import Settings, get_settings
from app.core.context import PlanningContext
from app.services import ConstraintEngine as ConstraintEngineInterface
from contracts import BlockCandidate, ConstraintViolation, ViolationSeverity


class ConstraintEngine(ConstraintEngineInterface):
    """Validates a candidate placement against hard railway constraints."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def settings(self) -> Settings:
        return self._settings

    @property
    def supported_codes(self) -> frozenset[str]:
        """Conflict codes this engine can emit with current schema data."""
        return SUPPORTED_CONFLICT_CODES

    @property
    def unsupported_constraints(self) -> dict[str, str]:
        """Codes explicitly not enforced, plus the schema-level reason."""
        return dict(UNSUPPORTED_CONFLICT_CODES)

    def validate(self, candidate: BlockCandidate, context: dict) -> list[ConstraintViolation]:
        """Return every constraint violation for ``candidate`` in fixed order."""
        ctx = PlanningContext.from_dict(context)
        violations: list[ConstraintViolation] = []
        violations.extend(self._check_duration(candidate, ctx))
        violations.extend(self._check_planning_horizon(candidate, ctx))
        violations.extend(self._check_corridor_location(candidate, ctx))
        violations.extend(self._check_existing_blocks(candidate, ctx))
        violations.extend(self._check_train_movements(candidate, ctx))
        violations.extend(self._check_resources(candidate, ctx))
        violations.extend(self._check_goods_forecast(candidate, ctx))
        return violations

    def evaluate(self, candidate: BlockCandidate, context: dict) -> "ValidationResult":
        """Validate and summarise into a boolean + structured records model."""
        from contracts import ValidationResult

        violations = self.validate(candidate, context)
        errors = [v for v in violations if v.severity == ViolationSeverity.ERROR]
        return ValidationResult(
            candidate_id=candidate.candidate_id,
            valid=not errors,
            violations=violations,
        )

    # ------------------------------------------------------------------ checks

    def _check_duration(self, candidate: BlockCandidate, ctx: PlanningContext) -> list[ConstraintViolation]:
        required = self._required_duration_minutes(candidate, ctx)
        if required is None:
            return []
        available = self._available_minutes(candidate)
        if candidate.total_duration_minutes < required or candidate.total_duration_minutes != available:
            return [
                self._violation(
                    ConflictCode.DURATION_CONFLICT,
                    f"required {required} minutes but only {available} available",
                    constraint_name="DURATION",
                    candidate=candidate,
                    reason=f"DURATION_SHORTFALL:available={available}:required={required}",
                )
            ]
        return []

    def _check_planning_horizon(self, candidate: BlockCandidate, ctx: PlanningContext) -> list[ConstraintViolation]:
        if ctx.horizon_start is None or ctx.horizon_end is None:
            return []
        violations: list[ConstraintViolation] = []
        if candidate.start_time < ctx.horizon_start:
            violations.append(
                self._violation(
                    ConflictCode.TIME_CONFLICT,
                    "candidate starts before the planning horizon",
                    constraint_name="PLANNING_HORIZON",
                    candidate=candidate,
                    reason=f"HORIZON_START:{ctx.horizon_start.isoformat()}",
                )
            )
        if candidate.end_time > ctx.horizon_end:
            violations.append(
                self._violation(
                    ConflictCode.TIME_CONFLICT,
                    "candidate ends after the planning horizon",
                    constraint_name="PLANNING_HORIZON",
                    candidate=candidate,
                    reason=f"HORIZON_END:{ctx.horizon_end.isoformat()}",
                )
            )
        return violations

    def _check_corridor_location(self, candidate: BlockCandidate, ctx: PlanningContext) -> list[ConstraintViolation]:
        if not ctx.corridors:
            return []
        corridor = next((c for c in ctx.corridors if c.corridor_id == candidate.corridor_id), None)
        if corridor is None:
            return [
                self._violation(
                    ConflictCode.CORRIDOR_CONFLICT,
                    f"corridor '{candidate.corridor_id}' is not in the provided corridor set",
                    constraint_name="CORRIDOR_AVAILABILITY",
                    candidate=candidate,
                    reason="CORRIDOR_UNKNOWN",
                )
            ]
        if corridor.sections and candidate.section not in corridor.sections:
            return [
                self._violation(
                    ConflictCode.LOCATION_CONFLICT,
                    f"section '{candidate.section}' is not part of corridor '{corridor.corridor_id}'",
                    constraint_name="LOCATION_COMPATIBILITY",
                    candidate=candidate,
                    reason=f"SECTION_NOT_IN_CORRIDOR:{','.join(sorted(corridor.sections))}",
                )
            ]
        return []

    def _check_existing_blocks(self, candidate: BlockCandidate, ctx: PlanningContext) -> list[ConstraintViolation]:
        violations: list[ConstraintViolation] = []
        for block in ctx.existing_blocks:
            if block.corridor_id != candidate.corridor_id or block.section != candidate.section:
                continue
            if block.status not in ACTIVE_BLOCK_STATUSES:
                continue
            if self._overlaps(candidate.start_time, candidate.end_time, block.start_time, block.end_time):
                violations.append(
                    self._violation(
                        ConflictCode.EXISTING_BLOCK_CONFLICT,
                        f"overlaps existing block '{block.block_id}' ({block.status.value})",
                        constraint_name="EXISTING_BLOCK",
                        candidate=candidate,
                        reason=f"BLOCK_OVERLAP:{block.block_id}",
                        affected=[block.block_id],
                    )
                )
        return violations

    def _check_train_movements(self, candidate: BlockCandidate, ctx: PlanningContext) -> list[ConstraintViolation]:
        buffer_minutes = self._settings.safety_buffer_minutes
        violations: list[ConstraintViolation] = []
        for movement in ctx.train_movements:
            if movement.corridor_id != candidate.corridor_id or movement.section != candidate.section:
                continue
            protected_start = movement.departure - timedelta(minutes=buffer_minutes)
            protected_end = movement.arrival + timedelta(minutes=buffer_minutes)
            if self._overlaps(candidate.start_time, candidate.end_time, protected_start, protected_end):
                violations.append(
                    self._violation(
                        ConflictCode.TRAIN_CONFLICT,
                        f"overlaps protected movement '{movement.train_number}' with {buffer_minutes} min safety buffer",
                        constraint_name="TRAIN_MOVEMENT",
                        candidate=candidate,
                        reason=f"MOVEMENT_OVERLAP:{movement.movement_id}:buffer_minutes={buffer_minutes}",
                        affected=[movement.movement_id],
                    )
                )
        return violations

    def _check_resources(self, candidate: BlockCandidate, ctx: PlanningContext) -> list[ConstraintViolation]:
        if not ctx.tasks or not ctx.resources:
            return []
        resolved = [t for t in ctx.tasks if t.task_id in candidate.task_ids]
        required_ids = sorted({r for t in resolved for r in t.required_resources})
        if not required_ids:
            return []
        violations: list[ConstraintViolation] = []
        for resource_id in required_ids:
            catalog = [r for r in ctx.resources if r.resource_id == resource_id]
            if not catalog:
                violations.append(
                    self._violation(
                        ConflictCode.RESOURCE_CONFLICT,
                        f"required resource '{resource_id}' is not in the catalogue; availability unverifiable",
                        constraint_name="RESOURCE_AVAILABILITY",
                        candidate=candidate,
                        severity=ViolationSeverity.WARNING,
                        reason="RESOURCE_UNKNOWN",
                        affected=[resource_id],
                    )
                )
                continue
            for resource in catalog:
                if resource.available_from is None and resource.available_until is None:
                    continue
                start_ok = resource.available_from is None or candidate.start_time >= resource.available_from
                end_ok = resource.available_until is None or candidate.end_time <= resource.available_until
                if not (start_ok and end_ok):
                    violations.append(
                        self._violation(
                            ConflictCode.RESOURCE_CONFLICT,
                            f"candidate window falls outside resource '{resource_id}' availability",
                            constraint_name="RESOURCE_AVAILABILITY",
                            candidate=candidate,
                            reason=f"RESOURCE_OUTSIDE_AVAILABILITY:{resource_id}",
                            affected=[resource_id],
                        )
                    )
                    break
        return violations

    def _check_goods_forecast(self, candidate: BlockCandidate, ctx: PlanningContext) -> list[ConstraintViolation]:
        threshold = self._settings.goods_forecast_probability_threshold
        peak_threshold = self._settings.goods_forecast_peak_threshold
        violations: list[ConstraintViolation] = []
        for forecast in ctx.goods_forecasts:
            if forecast.corridor_id != candidate.corridor_id or forecast.section != candidate.section:
                continue
            if forecast.date != candidate.start_time.date():
                continue
            if not self._overlaps_times(
                candidate.start_time.time(), candidate.end_time.time(),
                forecast.window_start, forecast.window_end,
            ):
                continue
            if forecast.probability >= peak_threshold:
                violations.append(
                    self._violation(
                        ConflictCode.GOODS_CONFLICT,
                        "candidate overlaps peak goods-traffic window",
                        constraint_name="GOODS_FORECAST",
                        candidate=candidate,
                        reason=f"GOODS_PEAK:prob={forecast.probability:.3f}",
                        affected=[forecast.forecast_id],
                    )
                )
            elif forecast.probability >= threshold:
                violations.append(
                    self._violation(
                        ConflictCode.GOODS_CONFLICT,
                        "candidate overlaps elevated goods-traffic window (advisory)",
                        constraint_name="GOODS_FORECAST",
                        candidate=candidate,
                        severity=ViolationSeverity.WARNING,
                        reason=f"GOODS_ELEVATED:prob={forecast.probability:.3f}",
                        affected=[forecast.forecast_id],
                    )
                )
        return violations

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _required_duration_minutes(candidate: BlockCandidate, ctx: PlanningContext) -> int | None:
        metadata_required = candidate.metadata.get("required_duration_minutes")
        if metadata_required is not None:
            return int(metadata_required)
        durations = [
            t.estimated_duration_minutes
            for t in ctx.tasks
            if t.task_id in candidate.task_ids
        ]
        return max(durations) if durations else None

    @staticmethod
    def _available_minutes(candidate: BlockCandidate) -> int:
        return int((candidate.end_time - candidate.start_time).total_seconds() // 60)

    @staticmethod
    def _overlaps(a_start, a_end, b_start, b_end) -> bool:
        return a_start < b_end and b_start < a_end

    @staticmethod
    def _overlaps_times(a_start, a_end, b_start, b_end) -> bool:
        return a_start < b_end and b_start < a_end

    def _violation(
        self,
        code: ConflictCode,
        message: str,
        *,
        constraint_name: str,
        candidate: BlockCandidate,
        reason: str = "",
        severity: ViolationSeverity = ViolationSeverity.ERROR,
        affected: list[str] | None = None,
    ) -> ConstraintViolation:
        return ConstraintViolation(
            constraint_name=constraint_name,
            violation_code=code.value,
            message=message,
            reason=reason or code.value,
            severity=severity,
            block_id=candidate.candidate_id,
            affected_ids=sorted(set(list(candidate.task_ids) + (affected or []))),
        )


__all__ = ["ConstraintEngine"]