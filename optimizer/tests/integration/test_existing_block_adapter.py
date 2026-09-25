from datetime import datetime, timezone

import pytest

from app.integration import AdapterError, AdapterErrorCode, ExistingBlockAdapter


START = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
END = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def payload(**overrides):
    values = {
        "id": "schedule-1",
        "scheduleCode": "SCH-1",
        "scheduleType": "MAINTENANCE",
        "corridorId": "corridor-1",
        "startTime": START.isoformat(),
        "endTime": END.isoformat(),
        "integratedTasks": ["task-1"],
        "status": "APPROVED",
        "section": "SEC-1",
        "sourceSystem": "DATA_INGESTION",
        "sourceRecordId": "source-schedule-1",
        "contractVersion": "m1-1",
    }
    values.update(overrides)
    return values


def test_existing_block_maps_explicit_projection_and_preserves_schedule_metadata():
    result = ExistingBlockAdapter().adapt_with_metadata(
        payload(occupancyType="TRAFFIC_BLOCK", relatedTaskIds=["task-1"])
    )

    assert result.block_id == "schedule-1"
    assert result.corridor_id == "corridor-1"
    assert result.section == "SEC-1"
    assert result.start_time == START
    assert result.end_time == END
    assert result.status.value == "APPROVED"
    assert result.related_task_ids == ["task-1"]
    assert result.metadata["scheduleCode"] == "SCH-1"
    assert result.metadata["status"] == "APPROVED"
    assert result.metadata["integratedTasks"] == ["task-1"]
    assert result.provenance["source_record_id"] == "source-schedule-1"


def test_existing_block_does_not_treat_schedule_without_section_as_block():
    source = payload()
    source.pop("section")

    with pytest.raises(AdapterError) as exc_info:
        ExistingBlockAdapter().adapt(source)

    assert exc_info.value.code == AdapterErrorCode.MISSING_TOPOLOGY
    assert exc_info.value.field == "section"


def test_existing_block_rejects_unmapped_schedule_status():
    with pytest.raises(AdapterError) as exc_info:
        ExistingBlockAdapter().adapt(payload(status="PROPOSED"))

    assert exc_info.value.code == AdapterErrorCode.UNSUPPORTED_MAPPING
    assert exc_info.value.field == "status"


def test_existing_block_rejects_invalid_window():
    with pytest.raises(AdapterError) as exc_info:
        ExistingBlockAdapter().adapt(payload(endTime=START.isoformat()))

    assert exc_info.value.code == AdapterErrorCode.INVALID_TIME_WINDOW
    assert exc_info.value.field == "endTime"


def test_existing_block_accepts_explicit_status_mapping():
    result = ExistingBlockAdapter().adapt(
        payload(status="PROPOSED"), status_mapping={"PROPOSED": "PLANNED"}
    )

    assert result.status.value == "PLANNED"
