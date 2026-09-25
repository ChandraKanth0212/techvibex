from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from contracts import Corridor

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
    AdaptedEntity,
    BaseAdapter,
    boolean_value,
    build_metadata,
    build_provenance,
    choose_explicit,
    construct_model,
    ensure_mapping,
    get_field,
    integer_value,
    invoke_topology_resolver,
    number_value,
    optional_string,
    required_string,
    string_list,
)


class CorridorAdapter(BaseAdapter[Corridor]):
    entity_type = "Corridor"
    model_type = Corridor

    def _adapt(
        self,
        payload: Mapping[str, Any],
        *,
        sections: list[str] | None = None,
        topology_resolver: Any = None,
        gauge: str | None = None,
        max_speed_kmph: float | None = None,
    ) -> AdaptedEntity[Corridor]:
        data = ensure_mapping(payload, self.entity_type)
        corridor_id = required_string(data, "id", self.entity_type, "id")
        name = required_string(data, "name", self.entity_type, "name")
        origin_station = required_string(
            data,
            ("startStation", "start_station"),
            self.entity_type,
            "startStation",
        )
        destination_station = required_string(
            data,
            ("endStation", "end_station"),
            self.entity_type,
            "endStation",
        )

        selected_sections = choose_explicit(
            data,
            ("sections", "sectionIds", "section_ids"),
            sections,
            self.entity_type,
            "sections",
        )
        if selected_sections is None and topology_resolver is not None:
            resolved = invoke_topology_resolver(data, topology_resolver, self.entity_type)
            if isinstance(resolved, Mapping):
                selected_sections = get_field(resolved, ("sections", "sectionIds", "section_ids"))
            else:
                selected_sections = resolved
        if selected_sections is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "sections",
                "Explicit topology sections are required; empty sections are not fabricated.",
                source_value=None,
            )
        if not isinstance(selected_sections, list) or not selected_sections:
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "sections",
                "Explicit topology sections must contain at least one section.",
                source_value=selected_sections,
            )
        normalized_sections = string_list(
            {"sections": selected_sections},
            "sections",
            self.entity_type,
            "sections",
        )

        source_electrified = get_field(data, "electrified")
        if source_electrified is None:
            parsed_electrified = None
        else:
            parsed_electrified = boolean_value(source_electrified, self.entity_type, "electrified")

        source_gauge = get_field(data, ("gauge",))
        selected_gauge = choose_explicit(
            data,
            "gauge",
            gauge,
            self.entity_type,
            "gauge",
        )
        if selected_gauge is None and source_gauge is not None:
            selected_gauge = source_gauge
        if selected_gauge is not None and (not isinstance(selected_gauge, str) or not selected_gauge.strip()):
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                self.entity_type,
                "gauge",
                "gauge must be a non-empty string when supplied.",
                source_value=selected_gauge,
            )

        source_speed = get_field(data, ("maxSpeedKmph", "max_speed_kmph", "maxSpeedKmph"))
        selected_speed = choose_explicit(
            data,
            ("maxSpeedKmph", "max_speed_kmph", "maxSpeedKmph"),
            max_speed_kmph,
            self.entity_type,
            "max_speed_kmph",
        )
        if selected_speed is None and source_speed is not None:
            selected_speed = source_speed
        parsed_speed = number_value(selected_speed, self.entity_type, "max_speed_kmph", minimum=0.000001) if selected_speed is not None else None

        source_code = optional_string(data, ("corridorCode", "code"), self.entity_type, "corridorCode")
        source_status = optional_string(data, "status", self.entity_type, "status")
        source_length = get_field(data, ("totalLengthKm", "total_length_km"))
        source_track_count = get_field(data, ("tracksCount", "tracks_count"))
        if source_length is not None:
            number_value(source_length, self.entity_type, "totalLengthKm", minimum=0)
        if source_track_count is not None:
            integer_value(source_track_count, self.entity_type, "tracksCount", minimum=0)

        provenance = build_provenance(data, corridor_id)
        metadata = build_metadata(
            data,
            (
                "corridorCode",
                "code",
                "totalLengthKm",
                "total_length_km",
                "tracksCount",
                "tracks_count",
                "status",
                "sourceSystem",
                "sourceRecordId",
                "ingestedAt",
                "updatedAt",
            ),
            provenance,
        )
        if source_code is not None:
            metadata["code"] = source_code
        if source_length is not None:
            metadata["total_length_km"] = source_length
        if source_track_count is not None:
            metadata["tracks_count"] = source_track_count
        if source_status is not None:
            metadata["status"] = source_status
        values: dict[str, Any] = {
            "corridor_id": corridor_id,
            "name": name,
            "origin_station": origin_station,
            "destination_station": destination_station,
            "sections": normalized_sections,
        }
        if parsed_electrified is not None:
            values["electrified"] = parsed_electrified
        if selected_gauge is not None:
            values["gauge"] = selected_gauge
        if parsed_speed is not None:
            values["max_speed_kmph"] = parsed_speed
        model = construct_model(Corridor, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)


def adapt_corridor(payload: Mapping[str, Any], **kwargs: Any) -> Corridor:
    return CorridorAdapter().adapt(payload, **kwargs)


def adapt_corridor_with_metadata(
    payload: Mapping[str, Any], **kwargs: Any
) -> AdaptedEntity[Corridor]:
    return CorridorAdapter().adapt_with_metadata(payload, **kwargs)
