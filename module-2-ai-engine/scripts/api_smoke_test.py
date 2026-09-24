"""
Live FastAPI Application Smoke Test Script.
Executes actual HTTP requests against Module 2 API endpoints using TestClient.
"""

from fastapi.testclient import TestClient
from app.main import app

def run_api_smoke_tests():
    client = TestClient(app)
    results = {}

    # 1. Health Probe
    resp_health = client.get("/api/v1/health")
    assert resp_health.status_code == 200
    assert resp_health.json()["status"] == "healthy"
    results["GET /api/v1/health"] = "PASS (200 OK)"

    # 2. Scoring Weights
    resp_weights = client.get("/api/v1/scoring/weights")
    assert resp_weights.status_code == 200
    assert "criticality" in resp_weights.json()["weights"]
    results["GET /api/v1/scoring/weights"] = "PASS (200 OK)"

    # 3. Single Task Evaluation (Valid & Invalid)
    valid_task = {
        "request_id": "REQ-SMOKE-01",
        "department": "ENGINEERING",
        "asset_id": "A-100",
        "asset_type": "RAIL_FRACTURE",
        "section": "SEC_SMOKE",
        "location": "KM10",
        "work_type": "Repair",
        "description": "Smoke test",
        "duration_minutes": 60,
        "criticality": 90.0
    }
    resp_task_val = client.post("/api/v1/evaluate/task", json=valid_task)
    assert resp_task_val.status_code == 200
    assert 0.0 <= resp_task_val.json()["priority_score"] <= 100.0

    invalid_task = dict(valid_task, criticality=150.0) # invalid > 100
    resp_task_inval = client.post("/api/v1/evaluate/task", json=invalid_task)
    assert resp_task_inval.status_code == 422
    results["POST /api/v1/evaluate/task"] = "PASS (200 OK Valid / 422 Invalid Rejected)"

    # 4. Batch Evaluation (Valid & Invalid)
    valid_batch = [valid_task]
    resp_batch_val = client.post("/api/v1/evaluate/batch", json=valid_batch)
    assert resp_batch_val.status_code == 200
    assert len(resp_batch_val.json()) == 1

    invalid_batch = [{"request_id": "REQ-BAD", "department": "INVALID_DEPT"}]
    resp_batch_inval = client.post("/api/v1/evaluate/batch", json=invalid_batch)
    assert resp_batch_inval.status_code == 422
    results["POST /api/v1/evaluate/batch"] = "PASS (200 OK Valid / 422 Invalid Rejected)"

    # 5. Candidate Match (Valid & Invalid)
    valid_cand_payload = [
        valid_task,
        {
            "request_id": "REQ-SMOKE-02",
            "department": "SIGNALLING",
            "asset_id": "A-101",
            "asset_type": "POINT_SWITCH",
            "section": "SEC_SMOKE",
            "location": "KM12",
            "work_type": "Signal Check",
            "description": "Sig smoke",
            "duration_minutes": 60
        }
    ]
    resp_cand_val = client.post("/api/v1/candidate/match", json=valid_cand_payload)
    assert resp_cand_val.status_code == 200
    assert resp_cand_val.json()["total_candidates_found"] == 1

    resp_cand_inval = client.post("/api/v1/candidate/match", json=[{"request_id": "BAD"}])
    assert resp_cand_inval.status_code == 422
    results["POST /api/v1/candidate/match"] = "PASS (200 OK Valid / 422 Malformed Rejected)"

    print("\n=== LIVE API SMOKE TEST RESULTS ===")
    for endpoint, status in results.items():
        print(f"[{status}] {endpoint}")
    return True

if __name__ == "__main__":
    run_api_smoke_tests()
