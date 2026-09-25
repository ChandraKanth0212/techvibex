import pytest

from app.integration import AdapterError, AdapterErrorCode, AssetAdapter


def payload(**overrides):
    values = {
        "id": "asset-1",
        "assetCode": "AST-1",
        "name": "Signal equipment",
        "assetType": "TRACK",
        "location": "Km 10",
        "lineSection": "SEC-1",
        "status": "ACTIVE",
        "department": "ENGINEERING",
        "sourceSystem": "GIS",
        "sourceRecordId": "source-asset-1",
        "contractVersion": "m1-1",
    }
    values.update(overrides)
    return values


def test_asset_maps_explicit_topology_and_preserves_line_section():
    result = AssetAdapter().adapt_with_metadata(
        payload(), corridor_id="corridor-1", section="SEC-1"
    )

    assert result.asset_id == "asset-1"
    assert result.asset_type.value == "TRACK"
    assert result.corridor_id == "corridor-1"
    assert result.section == "SEC-1"
    assert result.metadata["lineSection"] == "SEC-1"
    assert result.provenance["source_entity_id"] == "asset-1"


def test_asset_accepts_explicit_topology_resolver():
    result = AssetAdapter().adapt(
        payload(),
        topology_resolver=lambda source: {
            "corridor_id": "corridor-1",
            "section": "SEC-1",
        },
    )

    assert result.corridor_id == "corridor-1"
    assert result.section == "SEC-1"


def test_asset_does_not_map_signal_to_signalling():
    with pytest.raises(AdapterError) as exc_info:
        AssetAdapter().adapt(
            payload(assetType="SIGNAL"), corridor_id="corridor-1", section="SEC-1"
        )

    assert exc_info.value.code == AdapterErrorCode.UNSUPPORTED_MAPPING
    assert exc_info.value.field == "assetType"


def test_asset_does_not_use_line_section_as_section():
    with pytest.raises(AdapterError) as exc_info:
        AssetAdapter().adapt(payload(), corridor_id="corridor-1")

    assert exc_info.value.code == AdapterErrorCode.MISSING_TOPOLOGY
    assert exc_info.value.field == "section"


def test_asset_requires_corridor_resolution():
    with pytest.raises(AdapterError) as exc_info:
        AssetAdapter().adapt(payload(), section="SEC-1")

    assert exc_info.value.code == AdapterErrorCode.MISSING_TOPOLOGY
    assert exc_info.value.field == "corridor_id"
