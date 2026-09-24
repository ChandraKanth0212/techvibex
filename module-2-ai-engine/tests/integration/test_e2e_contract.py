import pytest
import json
from pathlib import Path
from app.adapters.module1_adapter import Module1InputAdapter
from app.adapters.module3_consumer import Module3ConsumerMock
from app.services.scoring_service import ScoringService
from app.services.candidate_service import CandidateService

def load_canonical_schema(schema_name: str) -> dict:
    schema_path = Path(__file__).resolve().parent.parent.parent.parent / "contracts" / schema_name
    with open(schema_path, "r", encoding="utf-8") as f:
        return json.load(f)

def test_end_to_end_contract_flow():
    # 1. Synthetic source payload from Module 1 / TMS
    raw_payload = {
        "request_id": "REQ-E2E-2026-001",
        "department": "ENGINEERING",
        "asset_id": "RAIL-SEC-AB-KM412",
        "asset_type": "RAIL_FRACTURE",
        "section": "SECTION_A_B",
        "location": "KM_412/12",
        "work_type": "Deep Screening",
        "description": "E2E Contract Flow Test Task",
        "duration_minutes": 180,
        "criticality": 95.0,
        "urgency": 90.0,
        "defect_severity": 88.0,
        "overdue_days": 14,
        "failure_probability": 0.85,
        "safety_impact": 95.0,
        "train_exposure": 85.0,
        "operational_impact": 80.0
    }

    # 2. Module 1 Adapter converts to canonical MaintenanceTaskInput
    task_input = Module1InputAdapter.adapt_source_payload(raw_payload)
    assert task_input.request_id == "REQ-E2E-2026-001"

    # 3. Module 2 AI Engine evaluates task
    scoring_service = ScoringService()
    recommendation = scoring_service.evaluate_task(task_input)

    # 4. Validate output payload against canonical JSON Schema constraints
    rec_dict = recommendation.model_dump(mode="json")
    rec_schema = load_canonical_schema("ai_recommendation.schema.json")
    for req_field in rec_schema["required"]:
        assert req_field in rec_dict, f"Missing required field '{req_field}' from ai_recommendation.schema.json"
    assert rec_dict["priority_level"] in rec_schema["properties"]["priority_level"]["enum"]
    assert rec_dict["risk_level"] in rec_schema["properties"]["risk_level"]["enum"]

    # 5. Module 3 Consumer consumes AI recommendation
    m3_result = Module3ConsumerMock.consume_ai_recommendation(recommendation)
    assert m3_result["consumed_request_id"] == "REQ-E2E-2026-001"
    assert m3_result["status"] == "ACCEPTED_FOR_OPTIMIZATION"

    # 6. Verify NO optimizer final scheduling fields are produced by Module 2
    for forbidden in Module3ConsumerMock.FORBIDDEN_OPTIMIZER_FIELDS:
        assert forbidden not in rec_dict

def test_end_to_end_batch_candidate_flow():
    raw_batch = [
        {
            "request_id": "REQ-E2E-BATCH-01",
            "department": "ENGINEERING",
            "asset_id": "A1",
            "asset_type": "RAIL_FRACTURE",
            "section": "SECTION_E_F",
            "location": "KM10",
            "work_type": "Track Repair",
            "description": "Track task",
            "duration_minutes": 120
        },
        {
            "request_id": "REQ-E2E-BATCH-02",
            "department": "SIGNALLING",
            "asset_id": "A2",
            "asset_type": "POINT_SWITCH",
            "section": "SECTION_E_F",
            "location": "KM12",
            "work_type": "Signal Check",
            "description": "Signal task",
            "duration_minutes": 120
        }
    ]

    canonical_tasks = Module1InputAdapter.adapt_batch_payload(raw_batch)
    cand_service = CandidateService()
    candidates_resp = cand_service.find_integration_candidates(canonical_tasks)

    m3_cand_result = Module3ConsumerMock.consume_integration_candidates(candidates_resp.groups)
    assert m3_cand_result["total_candidate_groups_accepted"] == 1
    assert m3_cand_result["groups"][0]["section"] == "SECTION_E_F"
