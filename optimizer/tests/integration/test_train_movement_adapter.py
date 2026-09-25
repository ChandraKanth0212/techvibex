from datetime import datetime, timezone

import pytest

from app.integration import AdapterError, AdapterErrorCode, TrainMovementAdapter


DEPARTURE = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
ARRIVAL = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)


def movement_payload(**overrides):
    values = {
        "movement_id": "movement-1",
        "train_number": "TRAIN-1",
        "corridor_id": "corridor-1",
        "section": "SEC-1",
        "departure": DEPARTURE.isoformat(),
        "arrival": ARRIVAL.isoformat(),
        "train_id": "train-1",
        "sourceSystem": "DATA_INGESTION",
        "sourceRecordId": "source-movement-1",
        "contractVersion": "m1-1",
    }
    values.update(overrides)
    return values


def test_train_movement_maps_explicit_section_projection():
    result = TrainMovementAdapter().adapt_with_metadata(movement_payload())

    assert result.movement_id == "movement-1"
    assert result.train_number == "TRAIN-1"
    assert result.corridor_id == "corridor-1"
    assert result.section == "SEC-1"
    assert result.departure == DEPARTURE
    assert result.arrival == ARRIVAL
    assert result.metadata["train_id"] == "train-1"
    assert result.provenance["source_entity_id"] == "movement-1"


def test_whole_module_one_train_is_not_converted_to_movement():
    payload = {
        "id": "train-1",
        "trainNumber": "TRAIN-1",
        "scheduledDeparture": DEPARTURE.isoformat(),
        "scheduledArrival": ARRIVAL.isoformat(),
        "originStationId": "A",
        "destinationStationId": "B",
    }

    with pytest.raises(AdapterError) as exc_info:
        TrainMovementAdapter().adapt(payload)

    assert exc_info.value.code == AdapterErrorCode.MISSING_REQUIRED_FIELD
    assert exc_info.value.field == "movement_id"


def test_train_movement_requires_explicit_section():
    payload = movement_payload()
    payload.pop("section")

    with pytest.raises(AdapterError) as exc_info:
        TrainMovementAdapter().adapt(payload)

    assert exc_info.value.code == AdapterErrorCode.MISSING_REQUIRED_FIELD
    assert exc_info.value.field == "section"


def test_train_movement_rejects_invalid_window():
    with pytest.raises(AdapterError) as exc_info:
        TrainMovementAdapter().adapt(movement_payload(arrival=DEPARTURE.isoformat()))

    assert exc_info.value.code == AdapterErrorCode.INVALID_TIME_WINDOW
    assert exc_info.value.field == "arrival"
