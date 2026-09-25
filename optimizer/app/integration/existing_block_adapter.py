from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from contracts import BlockStatus, ExistingBlock, OccupancyType

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
    BLOCK_STATUS_MAPPING,
    OCCUPANCY_TYPE_MAPPING,
    AdaptedEntity,
    BaseAdapter,
    build_metadata,
    build_provenance,
    choose_explicit,
    construct_model,
    ensure_mapping,
    get_field,
    invoke_topology_resolver,
    map_enum,
    optional_enum,
    parse_datetime,
    parse_interval,
    required_string,
    string_list,
)


class ExistingBlockAdapter(BaseAdapter[ExistingBlock]):
    entity_type = "ExistingBlock"
    model_type = ExistingBlock

    def _adapt(
        self,
        payload: Mapping[str, Any],
        *,
        section: str | None = None,
        topology_resolver: Any = None,
        occupancy_type: str | None = None,
        status: str | None = None,
        related_task_ids: list[str] | None = None,
        occupancy_type_mapping: Mapping[str, str | None] | None = None,
        status_mapping: Mapping[str, str | None] | None = None,
    ) -> AdaptedEntity[ExistingBlock]:
        data = ensure_mapping(payload, self.entity_type)
        block_id = required_string(data, "id", self.entity_type, "id")
        corridor_id = required_string(data, ("corridorId", "corridor_id"), self.entity_type, "corridorId")
        start_time = parse_datetime(
            required_string(data, ("startTime", "start_time"), self.entity_type, "startTime"),
            self.entity_type,
            "startTime",
        )
        end_time = parse_datetime(
            required_string(data, ("endTime", "end_time"), self.entity_type, "endTime"),
            self.entity_type,
            "endTime",
        )
        parse_interval(start_time, end_time, self.entity_type, "startTime", "endTime")

        source_section = choose_explicit(
            data,
            "section",
            section,
            self.entity_type,
            "section",
        )
        resolved = None
        if source_section is None and topology_resolver is not None:
            resolved = invoke_topology_resolver(data, topology_resolver, self.entity_type)
        if resolved is not None:
            if isinstance(resolved, Mapping):
                resolved_section = get_field(resolved, "section")
            elif isinstance(resolved, str):
                resolved_section = resolved
            else:
                raise AdapterError(
                    AdapterErrorCode.UNRESOLVED_RELATIONSHIP,
                    self.entity_type,
                    "section",
                    "The topology resolver must return a section value.",
                    source_value=resolved,
                )
            if source_section is None:
                source_section = resolved_section
        if source_section is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "section",
                "An explicit section projection is required; a Module 1 Schedule is not an ExistingBlock.",
                source_value=data.get("scheduleType"),
                details={"required_projection": "ExistingBlock"},
            )
        if not isinstance(source_section, str) or not source_section.strip():
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "section",
                "The resolved section must be a non-empty string.",
                source_value=source_section,
            )

        source_occupancy = get_field(data, ("occupancyType", "occupancy_type"))
        selected_occupancy = choose_explicit(
            data,
            ("occupancyType", "occupancy_type"),
            occupancy_type,
            self.entity_type,
            "occupancy_type",
        )
        if selected_occupancy is None and source_occupancy is not None:
            selected_occupancy = source_occupancy
        mapped_occupancy = optional_enum(
            selected_occupancy,
            OCCUPANCY_TYPE_MAPPING,
            OccupancyType,
            self.entity_type,
            "occupancy_type",
            occupancy_type_mapping,
        )

        source_status = get_field(data, ("status",))
        selected_status = choose_explicit(
            data,
            "status",
            status,
            self.entity_type,
            "status",
        )
        if selected_status is None and source_status is not None:
            selected_status = source_status
        mapped_status = optional_enum(
            selected_status,
            BLOCK_STATUS_MAPPING,
            BlockStatus,
            self.entity_type,
            "status",
            status_mapping,
        )

        source_related = get_field(data, ("relatedTaskIds", "related_task_ids"))
        selected_related = choose_explicit(
            data,
            ("relatedTaskIds", "related_task_ids"),
            related_task_ids,
            self.entity_type,
            "related_task_ids",
        )
        if selected_related is None and source_related is not None:
            selected_related = source_related
        normalized_related = string_list(
            {"relatedTaskIds": selected_related},
            "relatedTaskIds",
            self.entity_type,
            "related_task_ids",
        ) if selected_related is not None else []

        provenance = build_provenance(data, block_id)
        metadata = build_metadata(
            data,
            (
                "scheduleCode",
                "scheduleType",
                "status",
                "integratedTasks",
                "sourceSystem",
                "sourceRecordId",
                "ingestedAt",
                "updatedAt",
            ),
            provenance,
        )
        values: dict[str, Any] = {
            "block_id": block_id,
            "corridor_id": corridor_id,
            "section": source_section,
            "start_time": start_time,
            "end_time": end_time,
            "related_task_ids": normalized_related,
        }
        if mapped_occupancy is not None:
            values["occupancy_type"] = mapped_occupancy
        if mapped_status is not None:
            values["status"] = mapped_status
        model = construct_model(ExistingBlock, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)


def adapt_existing_block(payload: Mapping[str, Any], **kwargs: Any) -> ExistingBlock:
    return ExistingBlockAdapter().adapt(payload, **kwargs)


def adapt_existing_block_with_metadata(
    payload: Mapping[str, Any], **kwargs: Any
) -> AdaptedEntity[ExistingBlock]:
    return ExistingBlockAdapter().adapt_with_metadata(payload, **kwargs)
