from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from typing import Any

from contracts import GoodsForecast

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
    AdaptedEntity,
    BaseAdapter,
    build_metadata,
    build_provenance,
    choose_explicit,
    construct_model,
    ensure_mapping,
    get_field,
    number_value,
    parse_date,
    parse_datetime,
    parse_interval,
    parse_time,
    required_string,
)


class GoodsForecastAdapter(BaseAdapter[GoodsForecast]):
    entity_type = "GoodsForecast"
    model_type = GoodsForecast

    def _adapt(
        self,
        payload: Mapping[str, Any],
        *,
        section: str | None = None,
        forecast_date: date | str | None = None,
        probability: float | None = None,
        window_start: str | None = None,
        window_end: str | None = None,
        volume_tonnes: float | None = None,
        generated_at: datetime | str | None = None,
    ) -> AdaptedEntity[GoodsForecast]:
        data = ensure_mapping(payload, self.entity_type)
        forecast_id = required_string(data, "id", self.entity_type, "id")
        corridor_id = required_string(data, ("corridorId", "corridor_id"), self.entity_type, "corridorId")

        selected_section = choose_explicit(
            data,
            "section",
            section,
            self.entity_type,
            "section",
        )
        if selected_section is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "section",
                "GoodsForecast requires an explicit section projection.",
                source_value=data.get("corridorId"),
            )
        if not isinstance(selected_section, str) or not selected_section.strip():
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "section",
                "The section projection must be a non-empty string.",
                source_value=selected_section,
            )

        source_date = get_field(data, "date")
        selected_date = choose_explicit(
            data,
            "date",
            forecast_date,
            self.entity_type,
            "date",
        )
        if selected_date is None and source_date is not None:
            selected_date = source_date
        if selected_date is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                self.entity_type,
                "date",
                "GoodsForecast date must be supplied explicitly; it is not derived from a route timestamp.",
                source_value=None,
            )
        parsed_date = parse_date(selected_date, self.entity_type, "date")

        source_probability = get_field(data, "probability")
        selected_probability = choose_explicit(
            data,
            "probability",
            probability,
            self.entity_type,
            "probability",
        )
        if selected_probability is None and source_probability is not None:
            selected_probability = source_probability
        if selected_probability is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_PROBABILITY,
                self.entity_type,
                "probability",
                "GoodsForecast probability must be supplied explicitly.",
                source_value=None,
            )
        parsed_probability = number_value(
            selected_probability,
            self.entity_type,
            "probability",
            minimum=0,
            maximum=1,
        )

        source_window_start = get_field(data, "window_start")
        selected_window_start = choose_explicit(
            data,
            "window_start",
            window_start,
            self.entity_type,
            "window_start",
        )
        if selected_window_start is None and source_window_start is not None:
            selected_window_start = source_window_start
        if selected_window_start is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                self.entity_type,
                "window_start",
                "GoodsForecast window_start must be supplied explicitly.",
                source_value=None,
            )
        parsed_window_start = parse_time(selected_window_start, self.entity_type, "window_start")

        source_window_end = get_field(data, "window_end")
        selected_window_end = choose_explicit(
            data,
            "window_end",
            window_end,
            self.entity_type,
            "window_end",
        )
        if selected_window_end is None and source_window_end is not None:
            selected_window_end = source_window_end
        if selected_window_end is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_REQUIRED_FIELD,
                self.entity_type,
                "window_end",
                "GoodsForecast window_end must be supplied explicitly.",
                source_value=None,
            )
        parsed_window_end = parse_time(selected_window_end, self.entity_type, "window_end")
        parse_interval(
            parsed_window_start,
            parsed_window_end,
            self.entity_type,
            "window_start",
            "window_end",
        )

        source_volume = get_field(data, ("volume_tonnes", "volumeTonnes"))
        selected_volume = choose_explicit(
            data,
            ("volume_tonnes", "volumeTonnes"),
            volume_tonnes,
            self.entity_type,
            "volume_tonnes",
        )
        if selected_volume is None and source_volume is not None:
            selected_volume = source_volume
        parsed_volume = number_value(
            selected_volume,
            self.entity_type,
            "volume_tonnes",
            minimum=0,
        ) if selected_volume is not None else None

        source_generated_at = get_field(data, ("generated_at", "generatedAt"))
        selected_generated_at = choose_explicit(
            data,
            ("generated_at", "generatedAt"),
            generated_at,
            self.entity_type,
            "generated_at",
        )
        if selected_generated_at is None and source_generated_at is not None:
            selected_generated_at = source_generated_at
        parsed_generated_at = parse_datetime(
            selected_generated_at,
            self.entity_type,
            "generated_at",
        ) if selected_generated_at is not None else None

        provenance = build_provenance(data, forecast_id)
        metadata = build_metadata(
            data,
            (
                "trainId",
                "train_id",
                "estimatedTonnage",
                "routeHubs",
                "priority",
                "status",
                "estimatedDeparture",
                "estimatedArrival",
                "commodities",
                "sourceSystem",
                "sourceRecordId",
                "ingestedAt",
                "updatedAt",
            ),
            provenance,
        )
        values: dict[str, Any] = {
            "forecast_id": forecast_id,
            "corridor_id": corridor_id,
            "section": selected_section,
            "date": parsed_date,
            "window_start": parsed_window_start,
            "window_end": parsed_window_end,
            "probability": parsed_probability,
        }
        if parsed_volume is not None:
            values["volume_tonnes"] = parsed_volume
        if parsed_generated_at is not None:
            values["generated_at"] = parsed_generated_at
        model = construct_model(GoodsForecast, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)


def adapt_goods_forecast(payload: Mapping[str, Any], **kwargs: Any) -> GoodsForecast:
    return GoodsForecastAdapter().adapt(payload, **kwargs)


def adapt_goods_forecast_with_metadata(
    payload: Mapping[str, Any], **kwargs: Any
) -> AdaptedEntity[GoodsForecast]:
    return GoodsForecastAdapter().adapt_with_metadata(payload, **kwargs)
