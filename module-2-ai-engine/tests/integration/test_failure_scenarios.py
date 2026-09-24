import pytest
from datetime import datetime, timedelta
from app.adapters.module1_adapter import Module1InputAdapter
from app.core.exceptions import SchemaValidationException
from app.services.scoring_service import ScoringService
from app.services.candidate_service import CandidateService

def test_failure_scenario_1_malformed_task():
    with pytest.raises(SchemaValidationException, match="must be a JSON object"):
        Module1InputAdapter.adapt_source_payload("NOT_A_DICTIONARY")

def test_failure_scenario_2_missing_optional_values():
    raw_minimal = {
        "request_id": "REQ-MIN-001",
        "department": "ENGINEERING",
        "asset_id": "RAIL-100",
        "asset_type": "RAIL",
        "section": "SEC_A",
        "location": "KM10",
        "work_type": "Check",
        "description": "Minimal task",
        "duration_minutes": 60
    }
    task = Module1InputAdapter.adapt_source_payload(raw_minimal)
    assert task.criticality == 50.0
    assert task.urgency == 50.0
    assert task.defect_severity == 0.0
    assert task.failure_probability == 0.05

def test_failure_scenario_3_invalid_enum_department():
    raw_invalid_dept = {
        "request_id": "REQ-BAD-DEPT",
        "department": "INVALID_DEPARTMENT_NAME",
        "asset_id": "A1",
        "asset_type": "RAIL",
        "section": "SEC_A",
        "location": "KM10",
        "work_type": "Repair",
        "description": "Bad Dept",
        "duration_minutes": 60
    }
    with pytest.raises(SchemaValidationException, match="Invalid department identifier"):
        Module1InputAdapter.adapt_source_payload(raw_invalid_dept)

def test_failure_scenario_4_negative_duration():
    raw_neg_dur = {
        "request_id": "REQ-NEG-DUR",
        "department": "ENGINEERING",
        "asset_id": "A1",
        "asset_type": "RAIL",
        "section": "SEC_A",
        "location": "KM10",
        "work_type": "Repair",
        "description": "Negative duration",
        "duration_minutes": -30
    }
    with pytest.raises(Exception):
        Module1InputAdapter.adapt_source_payload(raw_neg_dur)

def test_failure_scenario_5_invalid_probability():
    raw_bad_prob = {
        "request_id": "REQ-BAD-PROB",
        "department": "ENGINEERING",
        "asset_id": "A1",
        "asset_type": "RAIL",
        "section": "SEC_A",
        "location": "KM10",
        "work_type": "Repair",
        "description": "Bad Probability",
        "duration_minutes": 60,
        "failure_probability": 2.5  # Invalid > 1.0
    }
    with pytest.raises(Exception):
        Module1InputAdapter.adapt_source_payload(raw_bad_prob)

def test_failure_scenario_6_invalid_date_range():
    now = datetime.utcnow()
    raw_bad_dates = {
        "request_id": "REQ-BAD-DATES",
        "department": "ENGINEERING",
        "asset_id": "A1",
        "asset_type": "RAIL",
        "section": "SEC_A",
        "location": "KM10",
        "work_type": "Repair",
        "description": "Bad Dates",
        "duration_minutes": 60,
        "preferred_start": (now + timedelta(hours=5)).isoformat(),
        "preferred_end": (now + timedelta(hours=2)).isoformat()  # End before start
    }
    with pytest.raises(SchemaValidationException, match="preferred_end must be strictly after preferred_start"):
        Module1InputAdapter.adapt_source_payload(raw_bad_dates)

def test_failure_scenario_7_same_section_incompatible_window():
    now = datetime.utcnow()
    raw_task1 = {
        "request_id": "REQ-WIN-01",
        "department": "ENGINEERING",
        "asset_id": "A1",
        "asset_type": "RAIL",
        "section": "SEC_X",
        "location": "KM10",
        "work_type": "Track",
        "description": "Morning",
        "duration_minutes": 60,
        "preferred_start": (now + timedelta(hours=1)).isoformat(),
        "preferred_end": (now + timedelta(hours=2)).isoformat()
    }
    raw_task2 = {
        "request_id": "REQ-WIN-02",
        "department": "SIGNALLING",
        "asset_id": "A2",
        "asset_type": "SIGNAL",
        "section": "SEC_X",
        "location": "KM10",
        "work_type": "Signal",
        "description": "Night",
        "duration_minutes": 60,
        "preferred_start": (now + timedelta(hours=15)).isoformat(),
        "preferred_end": (now + timedelta(hours=16)).isoformat()
    }
    t1 = Module1InputAdapter.adapt_source_payload(raw_task1)
    t2 = Module1InputAdapter.adapt_source_payload(raw_task2)
    cand_service = CandidateService()
    res = cand_service.find_integration_candidates([t1, t2])
    assert res.total_candidates_found == 0

def test_failure_scenario_8_missing_section():
    raw_no_sec = {
        "request_id": "REQ-NO-SEC",
        "department": "ENGINEERING",
        "asset_id": "A1",
        "asset_type": "RAIL",
        "location": "KM10",
        "work_type": "Repair",
        "description": "No section",
        "duration_minutes": 60
    }
    with pytest.raises(SchemaValidationException, match="Missing required canonical task fields"):
        Module1InputAdapter.adapt_source_payload(raw_no_sec)

def test_failure_scenario_9_unknown_asset_type():
    raw_unknown_asset = {
        "request_id": "REQ-UNK-ASSET",
        "department": "ENGINEERING",
        "asset_id": "A1",
        "asset_type": "UNKNOWN_CUSTOM_ASSET_TYPE",
        "section": "SEC_A",
        "location": "KM10",
        "work_type": "Repair",
        "description": "Unknown Asset Type",
        "duration_minutes": 60,
        "criticality": 50.0
    }
    t = Module1InputAdapter.adapt_source_payload(raw_unknown_asset)
    scoring_service = ScoringService()
    rec = scoring_service.evaluate_task(t)
    assert rec.request_id == "REQ-UNK-ASSET"
    assert 0.0 <= rec.priority_score <= 100.0

def test_failure_scenario_10_empty_batch():
    with pytest.raises(SchemaValidationException, match="Batch payload cannot be empty"):
        Module1InputAdapter.adapt_batch_payload([])

def test_failure_scenario_11_duplicate_request_ids():
    raw_dup = [
        {
            "request_id": "REQ-DUP-001",
            "department": "ENGINEERING",
            "asset_id": "A1",
            "asset_type": "RAIL",
            "section": "SEC_A",
            "location": "KM10",
            "work_type": "Repair",
            "description": "Task 1",
            "duration_minutes": 60
        },
        {
            "request_id": "REQ-DUP-001",
            "department": "SIGNALLING",
            "asset_id": "A2",
            "asset_type": "SIGNAL",
            "section": "SEC_A",
            "location": "KM12",
            "work_type": "Check",
            "description": "Duplicate task ID",
            "duration_minutes": 60
        }
    ]
    with pytest.raises(SchemaValidationException, match="Duplicate request_id detected in batch payload"):
        Module1InputAdapter.adapt_batch_payload(raw_dup)

def test_failure_scenario_12_invalid_integration_candidate_single_task():
    raw_single = [{
        "request_id": "REQ-SOLO-01",
        "department": "ENGINEERING",
        "asset_id": "A1",
        "asset_type": "RAIL",
        "section": "SEC_A",
        "location": "KM10",
        "work_type": "Repair",
        "description": "Solo task",
        "duration_minutes": 60
    }]
    tasks = Module1InputAdapter.adapt_batch_payload(raw_single)
    cand_service = CandidateService()
    res = cand_service.find_integration_candidates(tasks)
    assert res.total_candidates_found == 0
    assert len(res.groups) == 0
