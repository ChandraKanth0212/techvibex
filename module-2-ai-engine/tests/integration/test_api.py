import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "service" in data
    assert "RailOpt Module 2" in data["service"]

def test_scoring_weights_endpoint():
    response = client.get("/api/v1/scoring/weights")
    assert response.status_code == 200
    data = response.json()
    assert "weights" in data
    assert "criticality" in data["weights"]
    assert "asset_type_boosts" in data

def test_evaluate_valid_single_task():
    payload = {
        "request_id": "REQ-API-TEST-001",
        "department": "ENGINEERING",
        "asset_id": "RAIL-001",
        "asset_type": "RAIL_FRACTURE",
        "section": "SECTION_A_B",
        "location": "KM_100/12",
        "work_type": "Rail Weld Fix",
        "description": "API Test Rail Repair",
        "duration_minutes": 120,
        "criticality": 90.0,
        "urgency": 85.0,
        "defect_severity": 80.0,
        "overdue_days": 10,
        "failure_probability": 0.70,
        "safety_impact": 90.0,
        "train_exposure": 80.0,
        "operational_impact": 70.0
    }
    response = client.post("/api/v1/evaluate/task", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"] == "REQ-API-TEST-001"
    assert data["priority_score"] >= 80.0
    assert data["priority_level"] in ["CRITICAL", "HIGH"]
    assert "HIGH_ASSET_CRITICALITY" in data["reason_codes"]

def test_evaluate_invalid_missing_required_fields():
    # Missing required 'asset_id' and 'work_type'
    payload = {
        "request_id": "REQ-INVALID-001",
        "department": "ENGINEERING"
    }
    response = client.post("/api/v1/evaluate/task", json=payload)
    assert response.status_code == 422

def test_evaluate_malformed_numeric_boundary():
    # Out of range criticality score (>100)
    payload = {
        "request_id": "REQ-INVALID-002",
        "department": "ENGINEERING",
        "asset_id": "RAIL-001",
        "asset_type": "RAIL_FRACTURE",
        "section": "SECTION_A_B",
        "location": "KM_100/12",
        "work_type": "Fix",
        "description": "Bad Score",
        "duration_minutes": 60,
        "criticality": 150.0  # Invalid > 100
    }
    response = client.post("/api/v1/evaluate/task", json=payload)
    assert response.status_code == 422

def test_evaluate_batch_and_candidate_matching():
    payload = [
        {
            "request_id": "REQ-BATCH-01",
            "department": "ENGINEERING",
            "asset_id": "A1",
            "asset_type": "RAIL_FRACTURE",
            "section": "SECTION_A_B",
            "location": "KM10",
            "work_type": "Track",
            "description": "Eng task",
            "duration_minutes": 60
        },
        {
            "request_id": "REQ-BATCH-02",
            "department": "SIGNALLING",
            "asset_id": "A2",
            "asset_type": "POINT_SWITCH",
            "section": "SECTION_A_B",
            "location": "KM12",
            "work_type": "Signal",
            "description": "Sig task",
            "duration_minutes": 60
        }
    ]
    response = client.post("/api/v1/evaluate/batch", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # Check that candidate grouping was attached
    rec1 = next(item for item in data if item["request_id"] == "REQ-BATCH-01")
    assert rec1["integration_candidate"] is True
    assert rec1["integration_group_id"] is not None

def test_candidate_match_endpoint():
    payload = [
        {
            "request_id": "REQ-MATCH-01",
            "department": "ENGINEERING",
            "asset_id": "A1",
            "asset_type": "RAIL_FRACTURE",
            "section": "SECTION_X_Y",
            "location": "KM10",
            "work_type": "Track",
            "description": "Eng task",
            "duration_minutes": 60
        },
        {
            "request_id": "REQ-MATCH-02",
            "department": "TRACTION",
            "asset_id": "A3",
            "asset_type": "OHE_CATENARY",
            "section": "SECTION_X_Y",
            "location": "KM14",
            "work_type": "OHE",
            "description": "Trac task",
            "duration_minutes": 60
        }
    ]
    response = client.post("/api/v1/candidate/match", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["total_candidates_found"] == 1
    assert data["groups"][0]["section"] == "SECTION_X_Y"

def test_evaluation_determinism():
    payload = {
        "request_id": "REQ-DET-001",
        "department": "ENGINEERING",
        "asset_id": "A1",
        "asset_type": "RAIL_FRACTURE",
        "section": "SECTION_A_B",
        "location": "KM10",
        "work_type": "Repair",
        "description": "Determinism check",
        "duration_minutes": 60,
        "criticality": 85.0,
        "urgency": 75.0
    }
    resp1 = client.post("/api/v1/evaluate/task", json=payload).json()
    resp2 = client.post("/api/v1/evaluate/task", json=payload).json()
    
    assert resp1["priority_score"] == resp2["priority_score"]
    assert resp1["priority_level"] == resp2["priority_level"]
    assert resp1["risk_score"] == resp2["risk_score"]
    assert resp1["risk_level"] == resp2["risk_level"]
    assert resp1["reason_codes"] == resp2["reason_codes"]
    assert resp1["explanation"] == resp2["explanation"]
