from datetime import datetime, timezone

import pytest

from app.integration import AdapterError, AdapterErrorCode, MaintenanceTaskAdapter


NOW = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def payload(**overrides):
    values = {
        "id": "task-1",
        "taskCode": "TASK-CODE-1",
        "assetId": "asset-1",
        "corridorId": "corridor-1",
        "status": "REQUESTED",
        "priority": "HIGH",
        "estimatedDurationMinutes": 45,
        "startTimeWindow": NOW.isoformat(),
        "endTimeWindow": LATER.isoformat(),
        "requiredResources": ["crew-1"],
        "sourceSystem": "DATA_INGESTION",
        "sourceRecordId": "source-1",
        "contractVersion": "m1-1",
    }
    values.update(overrides)
    return values


def test_maintenance_task_maps_explicit_fields_and_preserves_provenance():
    result = MaintenanceTaskAdapter().adapt_with_metadata(
        payload(workType="PREVENTIVE")
    )

    assert result.task_id == "task-1"
    assert result.asset_id == "asset-1"
    assert result.corridor_id == "corridor-1"
    assert result.estimated_duration_minutes == 45
    assert result.window_start == NOW
    assert result.window_end == LATER
    assert result.required_resources == ["crew-1"]
    assert result.priority.value == "HIGH"
    assert result.metadata["taskCode"] == "TASK-CODE-1"
    assert result.metadata["status"] == "REQUESTED"
    assert result.provenance == {
        "source_entity_id": "task-1",
        "source_system": "DATA_INGESTION",
        "source_record_id": "source-1",
        "contract_version": "m1-1",
    }


def test_maintenance_task_requires_work_type():
    with pytest.raises(AdapterError) as exc_info:
        MaintenanceTaskAdapter().adapt(payload())

    assert exc_info.value.code == AdapterErrorCode.MISSING_REQUIRED_FIELD
    assert exc_info.value.field == "work_type"


def test_maintenance_task_rejects_null_asset_id():
    with pytest.raises(AdapterError) as exc_info:
        MaintenanceTaskAdapter().adapt(payload(workType="PREVENTIVE", assetId=None))

    assert exc_info.value.code == AdapterErrorCode.MISSING_REQUIRED_FIELD
    assert exc_info.value.field == "assetId"


def test_maintenance_task_does_not_map_critical_to_urgent():
    with pytest.raises(AdapterError) as exc_info:
        MaintenanceTaskAdapter().adapt(payload(workType="PREVENTIVE", priority="CRITICAL"))

    assert exc_info.value.code == AdapterErrorCode.UNSUPPORTED_MAPPING
    assert exc_info.value.field == "priority"


def test_maintenance_task_rejects_invalid_timestamp():
    with pytest.raises(AdapterError) as exc_info:
        MaintenanceTaskAdapter().adapt(
            payload(workType="PREVENTIVE", startTimeWindow="not-a-time")
        )

    assert exc_info.value.code == AdapterErrorCode.INVALID_TIME_WINDOW
    assert exc_info.value.field == "startTimeWindow"


def test_maintenance_task_rejects_invalid_priority():
    with pytest.raises(AdapterError) as exc_info:
        MaintenanceTaskAdapter().adapt(payload(workType="PREVENTIVE", priority="URGENT"))

    assert exc_info.value.code == AdapterErrorCode.INVALID_ENUM
    assert exc_info.value.field == "priority"
