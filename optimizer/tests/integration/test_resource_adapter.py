from datetime import datetime, timezone

import pytest

from app.integration import AdapterError, AdapterErrorCode, ResourceAdapter


START = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
END = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def payload(**overrides):
    values = {
        "id": "resource-1",
        "resourceCode": "RES-1",
        "name": "Crew A",
        "resourceType": "MATERIAL",
        "totalQuantity": 12,
        "availableQuantity": 8,
        "location": "Depot",
        "status": "AVAILABLE",
        "department": "ENGINEERING",
        "sourceSystem": "DATA_INGESTION",
        "sourceRecordId": "source-resource-1",
        "contractVersion": "m1-1",
    }
    values.update(overrides)
    return values


def test_resource_maps_explicit_scheduling_capacity():
    result = ResourceAdapter().adapt_with_metadata(
        payload(schedulingCapacity=2), available_from=START, available_until=END
    )

    assert result.resource_id == "resource-1"
    assert result.name == "Crew A"
    assert result.resource_type.value == "MATERIAL"
    assert result.capacity == 2
    assert result.available_from == START
    assert result.available_until == END
    assert result.metadata["totalQuantity"] == 12
    assert result.metadata["availableQuantity"] == 8
    assert result.provenance["source_entity_id"] == "resource-1"


def test_resource_does_not_convert_quantity_to_capacity():
    with pytest.raises(AdapterError) as exc_info:
        ResourceAdapter().adapt(payload())

    assert exc_info.value.code == AdapterErrorCode.MISSING_CAPACITY
    assert exc_info.value.field == "capacity"
    assert exc_info.value.source_value == 12


def test_resource_rejects_unsupported_source_type_mapping():
    with pytest.raises(AdapterError) as exc_info:
        ResourceAdapter().adapt(payload(resourceType="EQUIPMENT", schedulingCapacity=1))

    assert exc_info.value.code == AdapterErrorCode.UNSUPPORTED_MAPPING
    assert exc_info.value.field == "resourceType"


def test_resource_rejects_invalid_availability_window():
    with pytest.raises(AdapterError) as exc_info:
        ResourceAdapter().adapt(
            payload(schedulingCapacity=1, available_from=END, available_until=START)
        )

    assert exc_info.value.code == AdapterErrorCode.INVALID_TIME_WINDOW
    assert exc_info.value.field == "available_until"
