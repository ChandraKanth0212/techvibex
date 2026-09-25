from __future__ import annotations

from collections.abc import Iterable, Mapping
from copy import deepcopy
from dataclasses import asdict, is_dataclass
from datetime import date, datetime, time
from enum import Enum
from typing import Any

from pydantic import BaseModel

from contracts import PriorityLevel, PriorityResult

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
    AI_PRIORITY_MAPPING,
    AdaptedEntity,
    BaseAdapter,
    build_metadata,
    build_provenance,
    construct_model,
    map_enum,
    number_value,
)

_FACTOR_RANGES: dict[str, tuple[float | None, float | None]] = {
    "criticality_score": (0.0, 100.0),
    "urgency_score": (0.0, 100.0),
    "defect_severity_score": (0.0, 100.0),
    "safety_impact_score": (0.0, 100.0),
    "failure_risk_score": (0.0, 100.0),
    "train_exposure_score": (0.0, 100.0),
    "operational_impact_score": (0.0, 100.0),
    "overdue_factor": (0.0, None),
}
_RISK_LEVELS = frozenset({"EXTREME", "HIGH", "MODERATE", "LOW"})
_FORBIDDEN_OPTIMIZER_FIELDS = frozenset(
    {
        "final_block_start",
        "final_block_end",
        "corridor_allocation",
        "train_conflict_resolution",
        "goods_conflict_resolution",
        "crew_assignment",
        "final_schedule_status",
    }
)


def _json_safe(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if is_dataclass(value) and not isinstance(value, type):
        return _json_safe(asdict(value))
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return sorted((_json_safe(item) for item in value), key=repr)
    return value


def _payload_mapping(payload: Any, entity_type: str) -> dict[str, Any]:
    if isinstance(payload, Mapping):
        return _json_safe(dict(payload))

    dump = getattr(payload, "model_dump", None)
    if callable(dump):
        try:
            try:
                dumped = dump(mode="json")
            except TypeError:
                dumped = dump()
        except Exception as exc:
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                entity_type,
                None,
                "The Module 2 recommendation could not be serialized.",
                source_value=payload,
                details={"reason": str(exc)},
            ) from exc
        if isinstance(dumped, Mapping):
            return _json_safe(dict(dumped))

    legacy_dump = getattr(payload, "dict", None)
    if callable(legacy_dump):
        try:
            dumped = legacy_dump()
        except Exception as exc:
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                entity_type,
                None,
                "The Module 2 recommendation could not be serialized.",
                source_value=payload,
                details={"reason": str(exc)},
            ) from exc
        if isinstance(dumped, Mapping):
            return _json_safe(dict(dumped))

    if is_dataclass(payload) and not isinstance(payload, type):
        return _json_safe(asdict(payload))

    attributes = getattr(payload, "__dict__", None)
    if isinstance(attributes, Mapping) and attributes:
        return _json_safe(
            {key: value for key, value in attributes.items() if not key.startswith("_")}
        )

    raise AdapterError(
        AdapterErrorCode.INVALID_TYPE,
        entity_type,
        None,
        "The source AIRecommendation must be a mapping or expose model_dump().",
        source_value=payload,
    )


def _present_values(data: Mapping[str, Any], names: Iterable[str]) -> list[tuple[str, Any]]:
    return [
        (name, data[name])
        for name in names
        if name in data and data[name] is not None
    ]


def _select_alias(
    data: Mapping[str, Any],
    names: tuple[str, ...],
    field: str,
    entity_type: str,
    *,
    required: bool = False,
) -> Any:
    found = _present_values(data, names)
    if not found:
        if required:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                entity_type,
                field,
                f"Required Module 2 field {field} is missing.",
                source_value=None,
                details={"accepted_names": list(names)},
            )
        return None
    selected = found[0][1]
    selected_normalized = _json_safe(selected)
    for name, value in found[1:]:
        if _json_safe(value) != selected_normalized:
            raise AdapterError(
                AdapterErrorCode.AMBIGUOUS_MAPPING,
                entity_type,
                field,
                f"Conflicting source values were supplied for {field}.",
                source_value=value,
                details={"selected_field": found[0][0], "conflicting_field": name},
            )
    return selected


def _required_text(
    data: Mapping[str, Any],
    names: tuple[str, ...],
    field: str,
    entity_type: str,
) -> str:
    value = _select_alias(data, names, field, entity_type, required=True)
    if not isinstance(value, str) or not value.strip():
        code = (
            AdapterErrorCode.MISSING_REQUIRED_FIELD
            if isinstance(value, str)
            else AdapterErrorCode.INVALID_TYPE
        )
        raise AdapterError(
            code,
            entity_type,
            field,
            f"Module 2 field {field} must be a non-empty string.",
            source_value=value,
        )
    return value


def _optional_text(
    data: Mapping[str, Any],
    names: tuple[str, ...],
    field: str,
    entity_type: str,
) -> str | None:
    value = _select_alias(data, names, field, entity_type)
    if value is None:
        return None
    if not isinstance(value, str):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Module 2 field {field} must be a string when supplied.",
            source_value=value,
        )
    return value


def _object_field(value: Any, names: tuple[str, ...]) -> str | None:
    if isinstance(value, Mapping):
        found = _present_values(value, names)
        return found[0][1] if found else None
    for name in names:
        candidate = getattr(value, name, None)
        if candidate is not None:
            return candidate
    return None


def _coerce_task_ids(value: Any) -> list[str] | None:
    if value is None:
        return None
    if isinstance(value, str):
        values: Iterable[Any] = [value]
    elif isinstance(value, Mapping):
        values = value.keys()
    else:
        try:
            values = iter(value)
        except TypeError as exc:
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                "AIRecommendation",
                "known_task_ids",
                "Known task ids must be an iterable of task identifiers.",
                source_value=value,
            ) from exc

    result: list[str] = []
    for item in values:
        candidate = item if isinstance(item, str) else _object_field(item, ("task_id", "id", "request_id"))
        if not isinstance(candidate, str) or not candidate.strip():
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                "AIRecommendation",
                "known_task_ids",
                "Every known task must have a non-empty task identifier.",
                source_value=item,
            )
        result.append(candidate)
    return result


def _task_ids_from_source(value: Any) -> list[str] | None:
    if value is None:
        return None
    if isinstance(value, Mapping):
        for catalog_key in ("tasks", "maintenance_tasks", "task_ids"):
            if catalog_key in value:
                return _coerce_task_ids(value[catalog_key])
        return (
            _coerce_task_ids([value])
            if _object_field(value, ("task_id", "id", "request_id"))
            else None
        )
    if isinstance(value, (list, tuple, set, frozenset)):
        return _coerce_task_ids(value)
    tasks = getattr(value, "tasks", None)
    if tasks is None:
        tasks = getattr(value, "maintenance_tasks", None)
    if tasks is not None:
        return _coerce_task_ids(tasks)
    return (
        _coerce_task_ids([value])
        if _object_field(value, ("task_id", "id", "request_id"))
        else None
    )


def _validate_factors(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            "AIRecommendation",
            "factors",
            "Module 2 factors must be a mapping or FactorBreakdown object.",
            source_value=value,
        )
    factors = _json_safe(dict(value))
    for field, (minimum, maximum) in _FACTOR_RANGES.items():
        if field not in factors or factors[field] is None:
            continue
        number_value(
            factors[field],
            "AIRecommendation",
            f"factors.{field}",
            minimum=minimum,
            maximum=maximum,
        )
    return factors


def _validate_reason_codes(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            "AIRecommendation",
            "reason_codes",
            "Module 2 reason_codes must be an array of strings.",
            source_value=value,
        )
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                "AIRecommendation",
                "reason_codes",
                "Module 2 reason_codes must contain non-empty strings.",
                source_value=item,
            )
    return list(value)


class AIPriorityAdapter(BaseAdapter[PriorityResult]):
    entity_type = "AIRecommendation"
    model_type = PriorityResult

    def __init__(
        self,
        known_task_ids: Iterable[str] | None = None,
        tasks: Iterable[Any] | None = None,
        *,
        task_ids: Iterable[str] | None = None,
        known_tasks: Iterable[Any] | None = None,
        context: Any = None,
    ) -> None:
        self._known_task_ids = _coerce_task_ids(known_task_ids)
        self._task_ids = _coerce_task_ids(task_ids)
        self._tasks = tasks
        self._known_tasks = known_tasks
        self._context = context

    def _adapt(
        self,
        payload: Any,
        *,
        known_task_ids: Iterable[str] | None = None,
        task_ids: Iterable[str] | None = None,
        known_tasks: Iterable[Any] | None = None,
        tasks: Iterable[Any] | None = None,
        task_catalog: Iterable[Any] | None = None,
        maintenance_tasks: Iterable[Any] | None = None,
        context: Any = None,
    ) -> AdaptedEntity[PriorityResult]:
        data = _payload_mapping(payload, self.entity_type)
        forbidden_fields = sorted(_FORBIDDEN_OPTIMIZER_FIELDS.intersection(data))
        if forbidden_fields:
            field = forbidden_fields[0]
            raise AdapterError(
                AdapterErrorCode.UNSUPPORTED_MAPPING,
                self.entity_type,
                field,
                "Module 2 recommendations cannot contain optimizer-owned fields.",
                source_value=data[field],
                details={"forbidden_fields": forbidden_fields},
            )
        task_id = _required_text(
            data,
            ("request_id", "task_id"),
            "request_id",
            self.entity_type,
        )
        source_request_id = data.get("request_id")
        if not isinstance(source_request_id, str) or not source_request_id.strip():
            source_request_id = task_id
        self._validate_task_identity(
            task_id,
            known_task_ids=known_task_ids,
            task_ids=task_ids,
            known_tasks=known_tasks,
            tasks=tasks,
            task_catalog=task_catalog,
            maintenance_tasks=maintenance_tasks,
            context=context,
        )

        source_score = _select_alias(
            data,
            ("priority_score", "score"),
            "priority_score",
            self.entity_type,
            required=True,
        )
        priority_score = number_value(
            source_score,
            self.entity_type,
            "priority_score",
            minimum=0.0,
            maximum=100.0,
        )

        source_priority = _select_alias(
            data,
            ("priority_level", "priority", "recommended_priority"),
            "priority_level",
            self.entity_type,
            required=True,
        )
        recommended_priority = map_enum(
            source_priority,
            AI_PRIORITY_MAPPING,
            PriorityLevel,
            self.entity_type,
            "priority_level",
        )

        confidence_value = _select_alias(
            data,
            ("confidence", "confidence_score"),
            "confidence",
            self.entity_type,
        )
        confidence = (
            number_value(
                confidence_value,
                self.entity_type,
                "confidence",
                minimum=0.0,
                maximum=1.0,
            )
            if confidence_value is not None
            else None
        )

        risk_score_value = _select_alias(data, ("risk_score",), "risk_score", self.entity_type)
        risk_score = (
            number_value(
                risk_score_value,
                self.entity_type,
                "risk_score",
                minimum=0.0,
                maximum=100.0,
            )
            if risk_score_value is not None
            else None
        )
        risk_level = _optional_text(data, ("risk_level",), "risk_level", self.entity_type)
        if risk_level is not None and risk_level not in _RISK_LEVELS:
            raise AdapterError(
                AdapterErrorCode.INVALID_ENUM,
                self.entity_type,
                "risk_level",
                f"Unsupported Module 2 risk level {risk_level!r}.",
                source_value=risk_level,
                details={"allowed_values": sorted(_RISK_LEVELS)},
            )

        factors = _validate_factors(_select_alias(data, ("factors",), "factors", self.entity_type))
        action = _optional_text(
            data,
            ("recommended_action", "action"),
            "recommended_action",
            self.entity_type,
        )
        explanation = _optional_text(
            data,
            ("explanation", "rationale"),
            "explanation",
            self.entity_type,
        )
        reason_codes = _validate_reason_codes(
            _select_alias(data, ("reason_codes", "reasonCodes"), "reason_codes", self.entity_type)
        )
        integration_candidate = data.get("integration_candidate")
        if integration_candidate is not None and not isinstance(integration_candidate, bool):
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                self.entity_type,
                "integration_candidate",
                "Module 2 integration_candidate must be boolean when supplied.",
                source_value=integration_candidate,
            )
        integration_group_id = _optional_text(
            data,
            ("integration_group_id", "integrationGroupId"),
            "integration_group_id",
            self.entity_type,
        )
        integration_reason = _optional_text(
            data,
            ("integration_reason", "integrationReason"),
            "integration_reason",
            self.entity_type,
        )
        model_version = _optional_text(
            data,
            ("model_version", "modelVersion"),
            "model_version",
            self.entity_type,
        )
        scoring_version = _optional_text(
            data,
            ("scoring_version", "scoringVersion"),
            "scoring_version",
            self.entity_type,
        )
        recommendation_id = _optional_text(
            data,
            ("recommendation_id", "recommendationId"),
            "recommendation_id",
            self.entity_type,
        )
        if recommendation_id is None:
            generic_id = data.get("id")
            if isinstance(generic_id, str) and generic_id.strip():
                recommendation_id = generic_id

        source_recommendation = deepcopy(_json_safe(data))
        provenance = build_provenance(data, task_id)
        provenance["adapter"] = "ai_priority_adapter"
        provenance["source_module"] = "module-2-ai-engine"
        if recommendation_id is not None:
            provenance["recommendation_id"] = recommendation_id

        evidence: dict[str, Any] = {
            "source": "module2_ai_recommendation",
            "source_recommendation": source_recommendation,
            "recommendation_id": recommendation_id,
            "task_id": task_id,
            "request_id": source_request_id,
            "original_score": source_score,
            "original_priority": source_priority,
            "priority_score": priority_score,
            "priority_level": source_priority,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "risk": {"score": risk_score, "level": risk_level},
            "factors": factors,
            "recommended_action": action,
            "reason_codes": reason_codes,
            "explanation": explanation,
            "integration_candidate": integration_candidate,
            "integration_group_id": integration_group_id,
            "integration_reason": integration_reason,
            "confidence": confidence,
            "model_version": model_version,
            "scoring_version": scoring_version,
            "generated_at": data.get("generated_at"),
        }
        metadata = build_metadata(
            data,
            (
                "model_version",
                "modelVersion",
                "scoring_version",
                "scoringVersion",
                "generated_at",
                "source",
                "sourceSystem",
                "source_system",
                "sourceRecordId",
                "source_record_id",
                "contractVersion",
                "contract_version",
            ),
            provenance,
        )
        metadata.update(
            {
                "adapter": "ai_priority_adapter",
                "source_module": "module-2-ai-engine",
                "request_id": source_request_id,
                "task_id": task_id,
                "model_version": model_version,
                "scoring_version": scoring_version,
                "source_recommendation": source_recommendation,
                "original_score": source_score,
                "original_priority": source_priority,
                "risk_score": risk_score,
                "risk_level": risk_level,
                "risk": {"score": risk_score, "level": risk_level},
                "factors": factors,
                "recommended_action": action,
                "reason_codes": reason_codes,
                "explanation": explanation,
                "integration_candidate": integration_candidate,
                "integration_group_id": integration_group_id,
                "integration_reason": integration_reason,
                "confidence": confidence,
                "evidence": evidence,
            }
        )
        metadata["provenance"] = dict(provenance)

        values: dict[str, Any] = {
            "task_id": task_id,
            "priority_score": priority_score,
            "recommended_priority": recommended_priority,
            "confidence": confidence,
            "rationale": explanation or "",
            "model_version": model_version or "unknown",
            "recommendation_id": recommendation_id,
            "evidence": evidence,
            "metadata": metadata,
        }
        model = construct_model(PriorityResult, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)

    def _validate_task_identity(
        self,
        task_id: str,
        *,
        known_task_ids: Iterable[str] | None,
        task_ids: Iterable[str] | None,
        known_tasks: Iterable[Any] | None,
        tasks: Iterable[Any] | None,
        task_catalog: Iterable[Any] | None,
        maintenance_tasks: Iterable[Any] | None,
        context: Any,
    ) -> None:
        sources: list[list[str] | None] = []
        if self._known_task_ids is not None:
            sources.append(self._known_task_ids)
        if self._task_ids is not None:
            sources.append(self._task_ids)
        if known_task_ids is not None:
            sources.append(_coerce_task_ids(known_task_ids))
        if task_ids is not None:
            sources.append(_coerce_task_ids(task_ids))
        if self._tasks is not None:
            sources.append(_task_ids_from_source(self._tasks))
        if self._known_tasks is not None:
            sources.append(_task_ids_from_source(self._known_tasks))
        if self._context is not None:
            sources.append(_task_ids_from_source(self._context))
        if known_tasks is not None:
            sources.append(_task_ids_from_source(known_tasks))
        if tasks is not None:
            sources.append(_task_ids_from_source(tasks))
        if task_catalog is not None:
            sources.append(_task_ids_from_source(task_catalog))
        if maintenance_tasks is not None:
            sources.append(_task_ids_from_source(maintenance_tasks))
        if context is not None:
            sources.append(_task_ids_from_source(context))

        provided = [source for source in sources if source is not None]
        if not provided:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                self.entity_type,
                "known_task_ids",
                "A known task catalog is required to validate the recommendation task identity.",
                source_value=task_id,
            )
        known = {item for source in provided for item in source}
        if task_id not in known:
            raise AdapterError(
                AdapterErrorCode.UNRESOLVED_RELATIONSHIP,
                self.entity_type,
                "task_id",
                "The Module 2 recommendation refers to a task absent from the known task catalog.",
                source_value=task_id,
                details={"known_task_ids": sorted(known)},
            )


AIRecommendationAdapter = AIPriorityAdapter


def adapt_ai_priority(payload: Any, **kwargs: Any) -> PriorityResult:
    return AIPriorityAdapter().adapt(payload, **kwargs)


def adapt_ai_priority_with_metadata(
    payload: Any, **kwargs: Any
) -> AdaptedEntity[PriorityResult]:
    return AIPriorityAdapter().adapt_with_metadata(payload, **kwargs)


def adapt_ai_recommendation(payload: Any, **kwargs: Any) -> PriorityResult:
    return adapt_ai_priority(payload, **kwargs)


def adapt_ai_recommendation_with_metadata(
    payload: Any, **kwargs: Any
) -> AdaptedEntity[PriorityResult]:
    return adapt_ai_priority_with_metadata(payload, **kwargs)


__all__ = [
    "AI_PRIORITY_MAPPING",
    "AIPriorityAdapter",
    "AIRecommendationAdapter",
    "adapt_ai_priority",
    "adapt_ai_priority_with_metadata",
    "adapt_ai_recommendation",
    "adapt_ai_recommendation_with_metadata",
]
