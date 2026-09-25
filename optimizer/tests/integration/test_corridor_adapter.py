import pytest

from app.integration import AdapterError, AdapterErrorCode, CorridorAdapter


def payload(**overrides):
    values = {
        "id": "corridor-1",
        "corridorCode": "COR-1",
        "name": "Main line",
        "startStation": "A",
        "endStation": "B",
        "totalLengthKm": 12.5,
        "tracksCount": 2,
        "electrified": True,
        "status": "ACTIVE",
        "sourceSystem": "GIS",
        "sourceRecordId": "source-corridor-1",
        "contractVersion": "m1-1",
    }
    values.update(overrides)
    return values


def test_corridor_maps_target_fields_and_preserves_unmodelled_fields():
    result = CorridorAdapter().adapt_with_metadata(payload(), sections=["SEC-1", "SEC-2"])

    assert result.corridor_id == "corridor-1"
    assert result.name == "Main line"
    assert result.origin_station == "A"
    assert result.destination_station == "B"
    assert result.sections == ["SEC-1", "SEC-2"]
    assert result.electrified is True
    assert result.code == "COR-1"
    assert result.metadata["code"] == "COR-1"
    assert result.metadata["total_length_km"] == 12.5
    assert result.metadata["tracks_count"] == 2
    assert result.metadata["status"] == "ACTIVE"
    assert result.provenance["source_record_id"] == "source-corridor-1"


def test_corridor_requires_explicit_topology_sections():
    with pytest.raises(AdapterError) as exc_info:
        CorridorAdapter().adapt(payload())

    assert exc_info.value.code == AdapterErrorCode.MISSING_TOPOLOGY
    assert exc_info.value.field == "sections"


def test_corridor_rejects_empty_topology_sections():
    with pytest.raises(AdapterError) as exc_info:
        CorridorAdapter().adapt(payload(), sections=[])

    assert exc_info.value.code == AdapterErrorCode.MISSING_TOPOLOGY
    assert exc_info.value.field == "sections"


def test_corridor_accepts_explicit_topology_resolver():
    result = CorridorAdapter().adapt(
        payload(), topology_resolver=lambda source: ["SEC-1"]
    )

    assert result.sections == ["SEC-1"]
