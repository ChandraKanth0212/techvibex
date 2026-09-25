from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from contracts import TrainDirection, TrainMovement

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
    TRAIN_DIRECTION_MAPPING,
    AdaptedEntity,
    BaseAdapter,
    build_metadata,
    build_provenance,
    choose_explicit,
    construct_model,
    ensure_mapping,
    get_field,
    map_enum,
    optional_enum,
    parse_datetime,
    parse_interval,
    required_string,
    string_list,
)


class TrainMovementAdapter(BaseAdapter[TrainMovement]):
    entity_type = "TrainMovement"
    model_type = TrainMovement

    def _adapt(
        self,
        payload: Mapping[str, Any],
        *,
        direction: str | None = None,
        direction_mapping: Mapping[str, str | None] | None = None,
        stops: list[str] | None = None,
        frequency: str | None = None,
    ) -> AdaptedEntity[TrainMovement]:
        data = ensure_mapping(payload, self.entity_type)
        source_movement_id = get_field(data, ("movement_id", "movementId"))
        if source_movement_id is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                self.entity_type,
                "movement_id",
                "A section-level movement projection requires an explicit movement_id; a Module 1 Train ID is not a movement ID.",
                source_value=data.get("id"),
                details={"rejected_conversion": "Module1TrainToTrainMovement"},
            )
        movement_id = required_string(data, ("movement_id", "movementId"), self.entity_type, "movement_id")
        train_number = required_string(
            data,
            ("train_number", "trainNumber"),
            self.entity_type,
            "train_number",
        )
        corridor_id = required_string(
            data,
            ("corridor_id", "corridorId"),
            self.entity_type,
            "corridor_id",
        )
        section = required_string(data, "section", self.entity_type, "section")
        departure = parse_datetime(
            required_string(data, "departure", self.entity_type, "departure"),
            self.entity_type,
            "departure",
        )
        arrival = parse_datetime(
            required_string(data, "arrival", self.entity_type, "arrival"),
            self.entity_type,
            "arrival",
        )
        parse_interval(departure, arrival, self.entity_type, "departure", "arrival")

        source_direction = get_field(data, ("direction",))
        selected_direction = choose_explicit(
            data,
            "direction",
            direction,
            self.entity_type,
            "direction",
        )
        if selected_direction is None and source_direction is not None:
            selected_direction = source_direction
        mapped_direction = optional_enum(
            selected_direction,
            TRAIN_DIRECTION_MAPPING,
            TrainDirection,
            self.entity_type,
            "direction",
            direction_mapping,
        )

        source_stops = get_field(data, "stops")
        selected_stops = choose_explicit(data, "stops", stops, self.entity_type, "stops")
        if selected_stops is None and source_stops is not None:
            selected_stops = source_stops
        if selected_stops is None:
            normalized_stops: list[str] = []
        else:
            normalized_stops = string_list(
                {"stops": selected_stops},
                "stops",
                self.entity_type,
                "stops",
            )

        source_frequency = get_field(data, "frequency")
        selected_frequency = choose_explicit(
            data,
            "frequency",
            frequency,
            self.entity_type,
            "frequency",
        )
        if selected_frequency is None and source_frequency is not None:
            selected_frequency = source_frequency
        if selected_frequency is not None and not isinstance(selected_frequency, str):
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                self.entity_type,
                "frequency",
                "frequency must be a string when supplied.",
                source_value=selected_frequency,
            )

        provenance = build_provenance(data, movement_id)
        metadata = build_metadata(
            data,
            (
                "id",
                "trainId",
                "train_id",
                "trainNumber",
                "trainType",
                "priority",
                "status",
                "scheduledDeparture",
                "scheduledArrival",
                "originStationId",
                "destinationStationId",
                "lineSection",
                "sourceSystem",
                "sourceRecordId",
                "ingestedAt",
                "updatedAt",
            ),
            provenance,
        )
        values: dict[str, Any] = {
            "movement_id": movement_id,
            "train_number": train_number,
            "corridor_id": corridor_id,
            "section": section,
            "departure": departure,
            "arrival": arrival,
            "stops": normalized_stops,
        }
        if mapped_direction is not None:
            values["direction"] = mapped_direction
        if selected_frequency is not None:
            values["frequency"] = selected_frequency
        model = construct_model(TrainMovement, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)


def adapt_train_movement(payload: Mapping[str, Any], **kwargs: Any) -> TrainMovement:
    return TrainMovementAdapter().adapt(payload, **kwargs)


def adapt_train_movement_with_metadata(
    payload: Mapping[str, Any], **kwargs: Any
) -> AdaptedEntity[TrainMovement]:
    return TrainMovementAdapter().adapt_with_metadata(payload, **kwargs)
