from datetime import datetime, timezone

import pytest

from app.integration import AdapterError, AdapterErrorCode, BlockRequestAdapter


START = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
END = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def payload(**overrides):
    values = {
        "id": "request-1",
        "requestCode": "REQ-CODE-1",
        "corridorId": "corridor-1",
        "requestedStartTime": START.isoformat(),
        "requestedEndTime": END.isoformat(),
        "minDurationMinutes": 30,
        "status": "REQUESTED",
        "department": "ENGINEERING",
        "assetIds": ["asset-1"],
        "flexible": True,
        "sourceSystem": "DATA_INGESTION",
        "sourceRecordId": "source-request-1",
        "contractVersion": "m1-1",
    }
    values.update(overrides)
    return values


def test_block_request_maps_explicit_task_projection_and_preserves_source_fields():
    result = BlockRequestAdapter().adapt_with_metadata(
        payload(), task_ids=["task-1"], section="SEC-1"
    )

    assert result.request_id == "request-1"
    assert result.task_ids == ["task-1"]
    assert result.corridor_id == "corridor-1"
    assert result.section == "SEC-1"
    assert result.requested_start == START
    assert result.requested_end == END
    assert result.metadata["requestCode"] == "REQ-CODE-1"
    assert result.metadata["minDurationMinutes"] == 30
    assert result.metadata["status"] == "REQUESTED"
    assert result.metadata["department"] == "ENGINEERING"
    assert result.metadata["flexible"] is True


def test_block_request_does_not_convert_asset_ids_to_task_ids():
    with pytest.raises(AdapterError) as exc_info:
        BlockRequestAdapter().adapt(payload(), section="SEC-1")

    assert exc_info.value.code == AdapterErrorCode.UNRESOLVED_RELATIONSHIP
    assert exc_info.value.field == "assetIds"


def test_block_request_requires_section():
    with pytest.raises(AdapterError) as exc_info:
        BlockRequestAdapter().adapt(payload(), task_ids=["task-1"])

    assert exc_info.value.code == AdapterErrorCode.MISSING_TOPOLOGY
    assert exc_info.value.field == "section"


def test_block_request_rejects_invalid_window():
    with pytest.raises(AdapterError) as exc_info:
        BlockRequestAdapter().adapt(
            payload(requestedEndTime=START.isoformat()),
            task_ids=["task-1"],
            section="SEC-1",
        )

    assert exc_info.value.code == AdapterErrorCode.INVALID_TIME_WINDOW
    assert exc_info.value.field == "requestedEndTime"
