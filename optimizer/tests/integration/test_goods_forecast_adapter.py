from datetime import date

import pytest

from app.integration import AdapterError, AdapterErrorCode, GoodsForecastAdapter


def payload(**overrides):
    values = {
        "id": "forecast-1",
        "corridorId": "corridor-1",
        "trainId": "train-1",
        "estimatedTonnage": 200.0,
        "routeHubs": ["A", "B"],
        "priority": 2,
        "status": "FORECAST",
        "estimatedDeparture": "2026-01-01T08:00:00Z",
        "estimatedArrival": "2026-01-01T12:00:00Z",
        "section": "SEC-1",
        "date": "2026-01-01",
        "window_start": "08:00:00",
        "window_end": "12:00:00",
        "probability": 0.8,
        "sourceSystem": "SENSOR_NETWORK",
        "sourceRecordId": "source-forecast-1",
        "contractVersion": "m1-1",
    }
    values.update(overrides)
    return values


def test_goods_forecast_maps_explicit_projection_and_preserves_source_fields():
    result = GoodsForecastAdapter().adapt_with_metadata(payload())

    assert result.forecast_id == "forecast-1"
    assert result.corridor_id == "corridor-1"
    assert result.section == "SEC-1"
    assert result.date == date(2026, 1, 1)
    assert result.probability == 0.8
    assert result.metadata["trainId"] == "train-1"
    assert result.metadata["estimatedTonnage"] == 200.0
    assert result.metadata["routeHubs"] == ["A", "B"]
    assert result.metadata["estimatedDeparture"] == "2026-01-01T08:00:00Z"
    assert result.provenance["source_record_id"] == "source-forecast-1"


def test_goods_forecast_requires_probability():
    source = payload()
    source.pop("probability")

    with pytest.raises(AdapterError) as exc_info:
        GoodsForecastAdapter().adapt(source)

    assert exc_info.value.code == AdapterErrorCode.MISSING_PROBABILITY
    assert exc_info.value.field == "probability"


def test_goods_forecast_requires_section():
    source = payload()
    source.pop("section")

    with pytest.raises(AdapterError) as exc_info:
        GoodsForecastAdapter().adapt(source)

    assert exc_info.value.code == AdapterErrorCode.MISSING_TOPOLOGY
    assert exc_info.value.field == "section"


def test_goods_forecast_rejects_overnight_window():
    with pytest.raises(AdapterError) as exc_info:
        GoodsForecastAdapter().adapt(payload(window_start="23:00:00", window_end="01:00:00"))

    assert exc_info.value.code == AdapterErrorCode.INVALID_TIME_WINDOW
    assert exc_info.value.field == "window_end"
