from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, time
from enum import Enum
from math import isfinite
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ValidationError

from contracts import (
    AssetType,
    BlockStatus,
    OccupancyType,
    PriorityLevel,
    ResourceType,
    TrainDirection,
    WorkType,
)

from .errors import AdapterError, AdapterErrorCode

ModelT = TypeVar("ModelT", bound=BaseModel)
_MISSING = object()

PRIORITY_MAPPING: dict[str, str | None] = {
    "LOW": "LOW",
    "MEDIUM": "MEDIUM",
    "HIGH": "HIGH",
    "CRITICAL": None,
}

AI_PRIORITY_MAPPING: dict[str, str | None] = {
    "LOW": "LOW",
    "MEDIUM": "MEDIUM",
    "HIGH": "HIGH",
    "CRITICAL": None,
    "URGENT": None,
}

ASSET_TYPE_MAPPING: dict[str, str | None] = {
    "TRACK": "TRACK",
    "SIGNAL": None,
    "SWITCH": None,
    "CROSSING": None,
    "SUBSTATION": None,
    "OVERHEAD_LINE": None,
    "BRIDGE": "BRIDGE",
    "TUNNEL": "TUNNEL",
    "STATION": "STATION",
    "OTHER": "OTHER",
}

RESOURCE_TYPE_MAPPING: dict[str, str | None] = {
    "CREW": None,
    "VEHICLE": None,
    "EQUIPMENT": None,
    "MATERIAL": "MATERIAL",
    "INFRASTRUCTURE": None,
}

WORK_TYPE_MAPPING: dict[str, str | None] = {
    "PREVENTIVE": "PREVENTIVE",
    "CORRECTIVE": "CORRECTIVE",
    "INSPECTION": "INSPECTION",
    "REPAIR": "REPAIR",
    "REPLACEMENT": "REPLACEMENT",
    "UPGRADE": "UPGRADE",
}

OCCUPANCY_TYPE_MAPPING: dict[str, str | None] = {
    "TRAFFIC_BLOCK": "TRAFFIC_BLOCK",
    "POSSESSION": "POSSESSION",
    "SLOW_MOVEMENT": "SLOW_MOVEMENT",
}

BLOCK_STATUS_MAPPING: dict[str, str | None] = {
    "PLANNED": "PLANNED",
    "APPROVED": "APPROVED",
    "ACTIVE": "ACTIVE",
    "COMPLETED": "COMPLETED",
    "CANCELLED": "CANCELLED",
    "DRAFT": None,
    "PROPOSED": None,
    "EXECUTED": None,
}

TRAIN_DIRECTION_MAPPING: dict[str, str | None] = {
    "UP": "UP",
    "DOWN": "DOWN",
    "BOTH": "BOTH",
}

MAINTENANCE_PRIORITY_MAPPING = PRIORITY_MAPPING
ASSET_TYPE_ENUM_MAPPING = ASSET_TYPE_MAPPING
RESOURCE_TYPE_ENUM_MAPPING = RESOURCE_TYPE_MAPPING
SCHEDULE_STATUS_MAPPING = BLOCK_STATUS_MAPPING


@dataclass(frozen=True)
class AdaptedEntity(Generic[ModelT]):
    model: ModelT
    metadata: dict[str, Any]

    @property
    def entity(self) -> ModelT:
        return self.model

    @property
    def value(self) -> ModelT:
        return self.model

    @property
    def provenance(self) -> dict[str, Any]:
        value = self.metadata.get("provenance", {})
        return value if isinstance(value, dict) else {}

    def __getattr__(self, name: str) -> Any:
        try:
            return getattr(self.model, name)
        except AttributeError:
            if name in self.metadata:
                return self.metadata[name]
            raise


class BaseAdapter(Generic[ModelT]):
    entity_type: str
    model_type: type[ModelT]

    def adapt(self, payload: Mapping[str, Any], **kwargs: Any) -> ModelT:
        return self.adapt_with_metadata(payload, **kwargs).model

    def adapt_with_metadata(
        self, payload: Mapping[str, Any], **kwargs: Any
    ) -> AdaptedEntity[ModelT]:
        return self._adapt(payload, **kwargs)

    def adapt_with_provenance(
        self, payload: Mapping[str, Any], **kwargs: Any
    ) -> AdaptedEntity[ModelT]:
        return self.adapt_with_metadata(payload, **kwargs)

    def adapt_result(
        self, payload: Mapping[str, Any], **kwargs: Any
    ) -> AdaptedEntity[ModelT]:
        return self.adapt_with_metadata(payload, **kwargs)

    def from_canonical(self, payload: Mapping[str, Any], **kwargs: Any) -> ModelT:
        return self.adapt(payload, **kwargs)

    def _adapt(self, payload: Mapping[str, Any], **kwargs: Any) -> AdaptedEntity[ModelT]:
        raise NotImplementedError


def ensure_mapping(payload: Any, entity_type: str) -> Mapping[str, Any]:
    if not isinstance(payload, Mapping):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            None,
            "The source payload must be a mapping representing a Module 1 JSON object.",
            source_value=payload,
        )
    return payload


def get_field(
    data: Mapping[str, Any], names: str | tuple[str, ...], default: Any = None
) -> Any:
    fields = (names,) if isinstance(names, str) else names
    for name in fields:
        if name in data:
            return data[name]
    return default


def choose_explicit(
    data: Mapping[str, Any],
    names: str | tuple[str, ...],
    explicit: Any,
    entity_type: str,
    field: str,
) -> Any:
    source_value = get_field(data, names)
    if explicit is not None:
        if source_value is not _MISSING and source_value is not None and source_value != explicit:
            raise AdapterError(
                AdapterErrorCode.AMBIGUOUS_MAPPING,
                entity_type,
                field,
                f"Conflicting values were supplied for {field}.",
                source_value=source_value,
                details={"explicit_value": explicit},
            )
        return explicit
    if source_value is _MISSING:
        return None
    return source_value


def required_value(
    data: Mapping[str, Any],
    names: str | tuple[str, ...],
    entity_type: str,
    field: str,
) -> Any:
    value = get_field(data, names)
    if value is _MISSING or value is None:
        raise AdapterError(
            AdapterErrorCode.MISSING_REQUIRED_FIELD,
            entity_type,
            field,
            f"Required source field {field} is missing.",
            source_value=None,
            details={"accepted_names": list((names,) if isinstance(names, str) else names)},
        )
    return value


def required_string(
    data: Mapping[str, Any],
    names: str | tuple[str, ...],
    entity_type: str,
    field: str,
) -> str:
    value = required_value(data, names, entity_type, field)
    if not isinstance(value, str):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be a string.",
            source_value=value,
        )
    if not value.strip():
        raise AdapterError(
            AdapterErrorCode.MISSING_REQUIRED_FIELD,
            entity_type,
            field,
            f"Source field {field} must not be empty.",
            source_value=value,
        )
    return value


def optional_string(
    data: Mapping[str, Any],
    names: str | tuple[str, ...],
    entity_type: str,
    field: str,
) -> str | None:
    value = get_field(data, names)
    if value is _MISSING or value is None:
        return None
    if not isinstance(value, str):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be a string when supplied.",
            source_value=value,
        )
    return value


def string_list(
    data: Mapping[str, Any],
    names: str | tuple[str, ...],
    entity_type: str,
    field: str,
    allow_empty: bool = True,
) -> list[str]:
    value = get_field(data, names)
    if value is _MISSING or value is None:
        raise AdapterError(
            AdapterErrorCode.MISSING_REQUIRED_FIELD,
            entity_type,
            field,
            f"Required source field {field} is missing.",
            source_value=None,
        )
    if not isinstance(value, list):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be an array.",
            source_value=value,
        )
    if not value and not allow_empty:
        raise AdapterError(
            AdapterErrorCode.MISSING_REQUIRED_FIELD,
            entity_type,
            field,
            f"Source field {field} must contain at least one value.",
            source_value=value,
        )
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                entity_type,
                field,
                f"Source field {field} must contain non-empty strings.",
                source_value=item,
            )
        result.append(item)
    return result


def integer_value(
    value: Any,
    entity_type: str,
    field: str,
    minimum: int | None = None,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be an integer.",
            source_value=value,
        )
    if minimum is not None and value < minimum:
        code = (
            AdapterErrorCode.MISSING_CAPACITY
            if field == "capacity"
            else AdapterErrorCode.INVALID_TYPE
        )
        raise AdapterError(
            code,
            entity_type,
            field,
            f"Source field {field} must be at least {minimum}.",
            source_value=value,
        )
    return value


def number_value(
    value: Any,
    entity_type: str,
    field: str,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be numeric.",
            source_value=value,
        )
    result = float(value)
    if not isfinite(result):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be finite.",
            source_value=value,
        )
    if minimum is not None and result < minimum:
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be at least {minimum}.",
            source_value=value,
        )
    if maximum is not None and result > maximum:
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be at most {maximum}.",
            source_value=value,
        )
    return result


def boolean_value(value: Any, entity_type: str, field: str) -> bool:
    if not isinstance(value, bool):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be boolean.",
            source_value=value,
        )
    return value


def parse_datetime(value: Any, entity_type: str, field: str) -> datetime:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be an ISO-8601 timestamp.",
            source_value=value,
        )
    normalized = value[:-1] + "+00:00" if value.endswith(("Z", "z")) else value
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise AdapterError(
            AdapterErrorCode.INVALID_TIME_WINDOW,
            entity_type,
            field,
            f"Source field {field} is not a valid ISO-8601 timestamp.",
            source_value=value,
            details={"reason": str(exc)},
        ) from exc


def parse_date(value: Any, entity_type: str, field: str) -> date:
    if isinstance(value, datetime) or not isinstance(value, (str, date)):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be an ISO-8601 date.",
            source_value=value,
        )
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} is not a valid ISO-8601 date.",
            source_value=value,
            details={"reason": str(exc)},
        ) from exc


def parse_time(value: Any, entity_type: str, field: str) -> time:
    if not isinstance(value, str):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be an ISO-8601 time.",
            source_value=value,
        )
    try:
        return time.fromisoformat(value)
    except ValueError as exc:
        raise AdapterError(
            AdapterErrorCode.INVALID_TIME_WINDOW,
            entity_type,
            field,
            f"Source field {field} is not a valid ISO-8601 time.",
            source_value=value,
            details={"reason": str(exc)},
        ) from exc


def parse_interval(
    start: datetime | None,
    end: datetime | None,
    entity_type: str,
    start_field: str,
    end_field: str,
    require_pair: bool = True,
) -> None:
    if start is None or end is None:
        if require_pair:
            missing_field = start_field if start is None else end_field
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                entity_type,
                missing_field,
                f"Both {start_field} and {end_field} are required for this target model.",
            )
        return
    if end <= start:
        raise AdapterError(
            AdapterErrorCode.INVALID_TIME_WINDOW,
            entity_type,
            end_field,
            f"{end_field} must be after {start_field}.",
            source_value=end,
            details={"start": start.isoformat(), "end": end.isoformat()},
        )


def map_enum(
    value: Any,
    mapping: Mapping[str, str | None],
    enum_type: type[Enum],
    entity_type: str,
    field: str,
    overrides: Mapping[str, str | None] | None = None,
) -> Any:
    if not isinstance(value, str):
        raise AdapterError(
            AdapterErrorCode.INVALID_TYPE,
            entity_type,
            field,
            f"Source field {field} must be a string enum value.",
            source_value=value,
        )
    effective = dict(mapping)
    if overrides:
        effective.update(overrides)
    if value not in effective:
        raise AdapterError(
            AdapterErrorCode.INVALID_ENUM,
            entity_type,
            field,
            f"Unsupported source enum value {value!r} for {field}.",
            source_value=value,
            details={"allowed_values": sorted(effective)},
        )
    mapped = effective[value]
    if mapped is None:
        raise AdapterError(
            AdapterErrorCode.UNSUPPORTED_MAPPING,
            entity_type,
            field,
            f"No explicit mapping is defined for source enum value {value!r}.",
            source_value=value,
            details={"target_enum": enum_type.__name__},
        )
    try:
        return enum_type(mapped)
    except ValueError as exc:
        raise AdapterError(
            AdapterErrorCode.INVALID_ENUM,
            entity_type,
            field,
            f"Mapped value {mapped!r} is not valid for {enum_type.__name__}.",
            source_value=value,
            details={"mapped_value": mapped},
        ) from exc


def optional_enum(
    value: Any,
    mapping: Mapping[str, str | None],
    enum_type: type[Enum],
    entity_type: str,
    field: str,
    overrides: Mapping[str, str | None] | None = None,
) -> Any | None:
    if value is _MISSING or value is None:
        return None
    return map_enum(value, mapping, enum_type, entity_type, field, overrides)


def build_provenance(
    data: Mapping[str, Any], source_entity_id: Any
) -> dict[str, Any]:
    provenance: dict[str, Any] = {"source_entity_id": source_entity_id}
    source_system = get_field(data, ("sourceSystem", "source_system"))
    if source_system is not _MISSING and source_system is not None:
        provenance["source_system"] = source_system
    source_record_id = get_field(data, ("sourceRecordId", "source_record_id"))
    if source_record_id is not _MISSING and source_record_id is not None:
        provenance["source_record_id"] = source_record_id
    contract_version = get_field(data, ("contractVersion", "contract_version"))
    if contract_version is not _MISSING and contract_version is not None:
        provenance["contract_version"] = contract_version
    return provenance


def build_metadata(
    data: Mapping[str, Any], preserved_fields: tuple[str, ...], provenance: Mapping[str, Any]
) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for field in preserved_fields:
        if field in data:
            metadata[field] = data[field]
    metadata.update(provenance)
    metadata["provenance"] = dict(provenance)
    return metadata


def construct_model(
    model_type: type[ModelT],
    values: Mapping[str, Any],
    entity_type: str,
) -> ModelT:
    try:
        return model_type(**values)
    except ValidationError as exc:
        errors = exc.errors(include_url=False)
        first = errors[0] if errors else {}
        location = first.get("loc", ())
        field = ".".join(str(part) for part in location) or None
        error_type = str(first.get("type", ""))
        message = str(first.get("msg", "Target contract validation failed."))
        if "enum" in error_type:
            code = AdapterErrorCode.INVALID_ENUM
        elif any(token in (field or "").lower() for token in ("time", "window", "start", "end", "arrival", "departure")):
            code = AdapterErrorCode.INVALID_TIME_WINDOW
        else:
            code = AdapterErrorCode.INVALID_TYPE
        raise AdapterError(
            code,
            entity_type,
            field,
            message,
            source_value=first.get("input"),
            details={"validation_errors": errors},
        ) from exc


def invoke_topology_resolver(
    payload: Mapping[str, Any], resolver: Any, entity_type: str
) -> Any:
    if resolver is None:
        return None
    call = getattr(resolver, "resolve", resolver)
    if not callable(call):
        raise AdapterError(
            AdapterErrorCode.UNRESOLVED_RELATIONSHIP,
            entity_type,
            "topology",
            "The topology resolver must be callable or expose resolve().",
        )
    try:
        return call(payload)
    except AdapterError:
        raise
    except Exception as exc:
        raise AdapterError(
            AdapterErrorCode.UNRESOLVED_RELATIONSHIP,
            entity_type,
            "topology",
            "The topology resolver could not resolve the required relationship.",
            source_value=payload,
            details={"reason": str(exc)},
        ) from exc
