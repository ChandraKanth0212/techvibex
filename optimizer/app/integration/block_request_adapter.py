from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from contracts import BlockRequest, OccupancyType

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
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
    optional_enum,
    parse_datetime,
    parse_interval,
    required_string,
)


class BlockRequestAdapter(BaseAdapter[BlockRequest]):
    entity_type = "BlockRequest"
    model_type = BlockRequest

    def _adapt(
        self,
        payload: Mapping[str, Any],
        *,
        task_ids: list[str] | None = None,
        section: str | None = None,
        topology_resolver: Any = None,
        occupancy_type: str | None = None,
        notes: str | None = None,
        occupancy_type_mapping: Mapping[str, str | None] | None = None,
    ) -> AdaptedEntity[BlockRequest]:
        data = ensure_mapping(payload, self.entity_type)
        request_id = required_string(data, "id", self.entity_type, "id")
        corridor_id = required_string(data, ("corridorId", "corridor_id"), self.entity_type, "corridorId")
        requested_start = parse_datetime(
            required_string(
                data,
                ("requestedStartTime", "requested_start"),
                self.entity_type,
                "requestedStartTime",
            ),
            self.entity_type,
            "requestedStartTime",
        )
        requested_end = parse_datetime(
            required_string(
                data,
                ("requestedEndTime", "requested_end"),
                self.entity_type,
                "requestedEndTime",
            ),
            self.entity_type,
            "requestedEndTime",
        )
        parse_interval(
            requested_start,
            requested_end,
            self.entity_type,
            "requestedStartTime",
            "requestedEndTime",
        )

        selected_task_ids = choose_explicit(
            data,
            ("taskIds", "task_ids"),
            task_ids,
            self.entity_type,
            "task_ids",
        )
        source_asset_ids = get_field(data, ("assetIds", "asset_ids"))
        if selected_task_ids is None and source_asset_ids is not None:
            raise AdapterError(
                AdapterErrorCode.UNRESOLVED_RELATIONSHIP,
                self.entity_type,
                "assetIds",
                "assetIds cannot be converted to task_ids without an explicit asset-to-task correlation.",
                source_value=source_asset_ids,
                details={"required_resolution": "task_ids"},
            )
        if selected_task_ids is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                self.entity_type,
                "task_ids",
                "An explicit task_ids projection is required; assetIds are not task IDs.",
                source_value=source_asset_ids,
            )
        if not isinstance(selected_task_ids, list) or not selected_task_ids:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                self.entity_type,
                "task_ids",
                "task_ids must contain at least one task ID.",
                source_value=selected_task_ids,
            )
        for task_id in selected_task_ids:
            if not isinstance(task_id, str) or not task_id.strip():
                raise AdapterError(
                    AdapterErrorCode.INVALID_TYPE,
                    self.entity_type,
                    "task_ids",
                    "task_ids must contain non-empty strings.",
                    source_value=task_id,
                )

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
                "An explicit section is required for the Module 3 BlockRequest model.",
                source_value=data.get("assetIds"),
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
        mapped_occupancy = optional_enum(
            selected_occupancy,
            OCCUPANCY_TYPE_MAPPING,
            OccupancyType,
            self.entity_type,
            "occupancy_type",
            occupancy_type_mapping,
        )
        selected_notes = choose_explicit(
            data,
            "notes",
            notes,
            self.entity_type,
            "notes",
        )
        if selected_notes is not None and not isinstance(selected_notes, str):
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                self.entity_type,
                "notes",
                "notes must be a string when supplied.",
                source_value=selected_notes,
            )

        provenance = build_provenance(data, request_id)
        metadata = build_metadata(
            data,
            (
                "requestCode",
                "title",
                "description",
                "status",
                "department",
                "minDurationMinutes",
                "flexible",
                "assetIds",
                "sourceSystem",
                "sourceRecordId",
                "ingestedAt",
                "updatedAt",
            ),
            provenance,
        )
        values: dict[str, Any] = {
            "request_id": request_id,
            "task_ids": list(selected_task_ids),
            "corridor_id": corridor_id,
            "section": source_section,
            "requested_start": requested_start,
            "requested_end": requested_end,
            "notes": selected_notes or "",
        }
        if mapped_occupancy is not None:
            values["occupancy_type"] = mapped_occupancy
        model = construct_model(BlockRequest, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)


def adapt_block_request(payload: Mapping[str, Any], **kwargs: Any) -> BlockRequest:
    return BlockRequestAdapter().adapt(payload, **kwargs)


def adapt_block_request_with_metadata(
    payload: Mapping[str, Any], **kwargs: Any
) -> AdaptedEntity[BlockRequest]:
    return BlockRequestAdapter().adapt_with_metadata(payload, **kwargs)
