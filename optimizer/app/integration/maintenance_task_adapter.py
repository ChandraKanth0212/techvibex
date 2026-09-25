from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import Any

from contracts import MaintenanceTask, PriorityLevel, WorkType

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
    PRIORITY_MAPPING,
    WORK_TYPE_MAPPING,
    AdaptedEntity,
    BaseAdapter,
    build_metadata,
    build_provenance,
    choose_explicit,
    construct_model,
    ensure_mapping,
    integer_value,
    map_enum,
    optional_string,
    parse_date,
    parse_datetime,
    parse_interval,
    required_string,
    required_value,
    string_list,
)


class MaintenanceTaskAdapter(BaseAdapter[MaintenanceTask]):
    entity_type = "MaintenanceTask"
    model_type = MaintenanceTask

    def _adapt(
        self,
        payload: Mapping[str, Any],
        *,
        work_type: str | WorkType | None = None,
        work_type_mapping: Mapping[str, str | None] | None = None,
        priority_mapping: Mapping[str, str | None] | None = None,
        required_track_slots: int | None = None,
        due_by: date | str | None = None,
    ) -> AdaptedEntity[MaintenanceTask]:
        data = ensure_mapping(payload, self.entity_type)
        task_id = required_string(data, "id", self.entity_type, "id")
        asset_id = required_string(data, ("assetId", "asset_id"), self.entity_type, "assetId")
        corridor_id = required_string(data, ("corridorId", "corridor_id"), self.entity_type, "corridorId")
        duration = integer_value(
            required_value(
                data,
                ("estimatedDurationMinutes", "estimated_duration_minutes"),
                self.entity_type,
                "estimatedDurationMinutes",
            ),
            self.entity_type,
            "estimatedDurationMinutes",
            minimum=1,
        )
        priority = map_enum(
            required_value(data, "priority", self.entity_type, "priority"),
            PRIORITY_MAPPING,
            PriorityLevel,
            self.entity_type,
            "priority",
            priority_mapping,
        )
        department = optional_string(data, "department", self.entity_type, "department")
        description = optional_string(data, "description", self.entity_type, "description") or ""
        required_resources = string_list(
            data,
            ("requiredResources", "required_resources"),
            self.entity_type,
            "requiredResources",
        ) if ("requiredResources" in data or "required_resources" in data) else []

        selected_work_type = choose_explicit(
            data,
            ("workType", "work_type"),
            work_type,
            self.entity_type,
            "work_type",
        )
        if selected_work_type is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                self.entity_type,
                "work_type",
                "An explicit work_type mapping is required; Module 1 MaintenanceTask has no work_type field.",
                source_value=selected_work_type,
                details={"accepted_names": ["workType", "work_type"]},
            )
        mapped_work_type = map_enum(
            selected_work_type,
            WORK_TYPE_MAPPING,
            WorkType,
            self.entity_type,
            "work_type",
            work_type_mapping,
        )

        window_value = data.get("startTimeWindow", data.get("window_start"))
        end_window_value = data.get("endTimeWindow", data.get("window_end"))
        window_start = parse_datetime(window_value, self.entity_type, "startTimeWindow") if window_value is not None else None
        window_end = parse_datetime(end_window_value, self.entity_type, "endTimeWindow") if end_window_value is not None else None
        parse_interval(
            window_start,
            window_end,
            self.entity_type,
            "startTimeWindow",
            "endTimeWindow",
            require_pair=False,
        )

        source_slots = data.get("requiredTrackSlots", data.get("required_track_slots"))
        selected_slots = choose_explicit(
            data,
            ("requiredTrackSlots", "required_track_slots"),
            required_track_slots,
            self.entity_type,
            "required_track_slots",
        )
        if selected_slots is None and source_slots is not None:
            selected_slots = source_slots
        if selected_slots is not None:
            selected_slots = integer_value(
                selected_slots,
                self.entity_type,
                "required_track_slots",
                minimum=1,
            )

        source_due_by = data.get("dueBy", data.get("due_by"))
        selected_due_by = choose_explicit(
            data,
            ("dueBy", "due_by"),
            due_by,
            self.entity_type,
            "due_by",
        )
        if selected_due_by is None and source_due_by is not None:
            selected_due_by = source_due_by
        parsed_due_by = parse_date(selected_due_by, self.entity_type, "due_by") if selected_due_by is not None else None

        provenance = build_provenance(data, task_id)
        metadata = build_metadata(
            data,
            (
                "taskCode",
                "status",
                "sourceSystem",
                "sourceRecordId",
                "ingestedAt",
                "updatedAt",
            ),
            provenance,
        )
        values: dict[str, Any] = {
            "task_id": task_id,
            "asset_id": asset_id,
            "corridor_id": corridor_id,
            "work_type": mapped_work_type,
            "estimated_duration_minutes": duration,
            "priority": priority,
            "department": department,
            "required_resources": required_resources,
            "window_start": window_start,
            "window_end": window_end,
            "description": description,
            "metadata": metadata,
        }
        if selected_slots is not None:
            values["required_track_slots"] = selected_slots
        if parsed_due_by is not None:
            values["due_by"] = parsed_due_by
        model = construct_model(MaintenanceTask, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)


def adapt_maintenance_task(
    payload: Mapping[str, Any], **kwargs: Any
) -> MaintenanceTask:
    return MaintenanceTaskAdapter().adapt(payload, **kwargs)


def adapt_maintenance_task_with_metadata(
    payload: Mapping[str, Any], **kwargs: Any
) -> AdaptedEntity[MaintenanceTask]:
    return MaintenanceTaskAdapter().adapt_with_metadata(payload, **kwargs)
