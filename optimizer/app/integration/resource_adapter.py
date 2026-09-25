from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from contracts import Resource, ResourceType

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
    RESOURCE_TYPE_MAPPING,
    AdaptedEntity,
    BaseAdapter,
    build_metadata,
    build_provenance,
    choose_explicit,
    construct_model,
    ensure_mapping,
    get_field,
    integer_value,
    map_enum,
    parse_datetime,
    parse_interval,
    required_string,
)


class ResourceAdapter(BaseAdapter[Resource]):
    entity_type = "Resource"
    model_type = Resource

    def _adapt(
        self,
        payload: Mapping[str, Any],
        *,
        capacity: int | None = None,
        available_from: str | None = None,
        available_until: str | None = None,
        resource_type_mapping: Mapping[str, str | None] | None = None,
    ) -> AdaptedEntity[Resource]:
        data = ensure_mapping(payload, self.entity_type)
        resource_id = required_string(data, "id", self.entity_type, "id")
        name = required_string(data, "name", self.entity_type, "name")
        source_resource_type = required_string(
            data,
            ("resourceType", "resource_type"),
            self.entity_type,
            "resourceType",
        )
        mapped_resource_type = map_enum(
            source_resource_type,
            RESOURCE_TYPE_MAPPING,
            ResourceType,
            self.entity_type,
            "resourceType",
            resource_type_mapping,
        )

        selected_capacity = choose_explicit(
            data,
            ("schedulingCapacity", "scheduling_capacity", "capacity"),
            capacity,
            self.entity_type,
            "capacity",
        )
        if selected_capacity is None:
            source_quantity = get_field(
                data,
                ("totalQuantity", "availableQuantity"),
            )
            raise AdapterError(
                AdapterErrorCode.MISSING_CAPACITY,
                self.entity_type,
                "capacity",
                "Scheduling capacity must be supplied explicitly; resource quantities are not capacities.",
                source_value=source_quantity,
                details={"ignored_fields": ["totalQuantity", "availableQuantity"]},
            )
        parsed_capacity = integer_value(
            selected_capacity,
            self.entity_type,
            "capacity",
            minimum=1,
        )

        source_available_from = get_field(data, ("available_from", "availableFrom"))
        selected_available_from = choose_explicit(
            data,
            ("available_from", "availableFrom"),
            available_from,
            self.entity_type,
            "available_from",
        )
        if selected_available_from is None and source_available_from is not None:
            selected_available_from = source_available_from
        parsed_available_from = parse_datetime(
            selected_available_from,
            self.entity_type,
            "available_from",
        ) if selected_available_from is not None else None

        source_available_until = get_field(data, ("available_until", "availableUntil"))
        selected_available_until = choose_explicit(
            data,
            ("available_until", "availableUntil"),
            available_until,
            self.entity_type,
            "available_until",
        )
        if selected_available_until is None and source_available_until is not None:
            selected_available_until = source_available_until
        parsed_available_until = parse_datetime(
            selected_available_until,
            self.entity_type,
            "available_until",
        ) if selected_available_until is not None else None
        parse_interval(
            parsed_available_from,
            parsed_available_until,
            self.entity_type,
            "available_from",
            "available_until",
            require_pair=False,
        )

        provenance = build_provenance(data, resource_id)
        metadata = build_metadata(
            data,
            (
                "resourceCode",
                "totalQuantity",
                "availableQuantity",
                "location",
                "status",
                "department",
                "nextMaintenance",
                "sourceSystem",
                "sourceRecordId",
                "ingestedAt",
                "updatedAt",
            ),
            provenance,
        )
        values: dict[str, Any] = {
            "resource_id": resource_id,
            "name": name,
            "resource_type": mapped_resource_type,
            "capacity": parsed_capacity,
            "attributes": metadata,
        }
        if parsed_available_from is not None:
            values["available_from"] = parsed_available_from
        if parsed_available_until is not None:
            values["available_until"] = parsed_available_until
        model = construct_model(Resource, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)


def adapt_resource(payload: Mapping[str, Any], **kwargs: Any) -> Resource:
    return ResourceAdapter().adapt(payload, **kwargs)


def adapt_resource_with_metadata(
    payload: Mapping[str, Any], **kwargs: Any
) -> AdaptedEntity[Resource]:
    return ResourceAdapter().adapt_with_metadata(payload, **kwargs)
