"""Phase 7A end-to-end integration tests for the optimizer pipeline.

Drives POST /api/optimizer/generate (the orchestrator: candidate generation ->
integrated-block detection -> CP-SAT optimisation -> independent validation ->
KPI computation -> explanations) and asserts the structured plan response,
the byte-for-byte determinism contract for identical inputs, and per-request
settings overrides.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from app.core.context import PlanningContext
from tests.helpers import NOW, make_planning_context, sample_block_request, sample_task


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app(settings=Settings()))


def build_task(task_id: str, **overrides):
    values = dict(
        task_id=task_id,
        window_start=NOW,
        window_end=NOW + timedelta(hours=3),
        estimated_duration_minutes=60,
        priority="HIGH",
        required_resources=[],
    )
    values.update(overrides)
    return sample_task(**values)


def context_payload(tasks):
    return PlanningContext.from_dict(
        make_planning_context(tasks=tasks, block_requests=[])
    ).model_dump(mode="json")


def request_payload(request_id="REQ-E2E", task_ids=("T1", "T2")):
    return sample_block_request(
        request_id=request_id,
        task_ids=list(task_ids),
        requested_start=NOW,
        requested_end=NOW + timedelta(hours=3),
    ).model_dump(mode="json")


def integrated_settings():
    return {"objective_weights": {"slot_consolidation": 2.0}}


def generate(client, request=None, context=None, settings=None):
    response = client.post(
        "/api/optimizer/generate",
        json={
            "request": request,
            "context": context,
            "settings": settings,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_full_pipeline_end_to_end(client):
    plan = generate(
        client,
        request=request_payload(task_ids=["T1", "T2"]),
        context=context_payload([build_task("T1"), build_task("T2")]),
        settings=integrated_settings(),
    )

    assert plan["plan_id"].startswith("PLAN-")
    assert plan["data_mode"] == "SYNTHETIC_DEMO"
    assert plan["storage"] == "IN_MEMORY"
    assert plan["meta"]["scope_task_ids"] == ["T1", "T2"]

    schedule = plan["schedule"]
    assert schedule["schedule_id"] == "SCHED-REQ-E2E"
    assert plan["solver_status"] == schedule["status"] in {"OPTIMAL", "FEASIBLE"}
    assert set(schedule["scheduled_task_ids"]) == {"T1", "T2"}
    assert schedule["unscheduled_task_ids"] == []

    validation = plan["validation"]
    assert validation["valid"] is True
    assert validation["solver_status"] == plan["solver_status"]
    assert validation["errors"] == []

    metrics = plan["metrics"]
    assert metrics["total_tasks_scheduled"] == 2
    assert metrics["total_tasks_requested"] == 2
    assert metrics["task_coverage_ratio"] == 1.0
    assert metrics["integrated_blocks_count"] == 1

    blocks = schedule["selected_blocks"]
    assert len(blocks) == 1
    assert blocks[0]["block_type"] == "INTEGRATED"
    assert set(blocks[0]["task_ids"]) == {"T1", "T2"}


def test_plan_explains_each_schedule_element(client):
    plan = generate(
        client,
        request=request_payload(task_ids=["T1", "T2"]),
        context=context_payload([build_task("T1"), build_task("T2")]),
        settings=integrated_settings(),
    )
    records = plan["explanations"]["records"]
    recorded = {}
    for record in records:
        recorded.setdefault(record["subject_type"], []).append(record)

    scheduled = {record["subject_id"] for record in recorded["SCHEDULED_TASK"]}
    assert scheduled == {"T1", "T2"}
    assert any(record["reason_codes"] for record in recorded["SCHEDULED_TASK"])

    integrated = recorded["INTEGRATED_BLOCK"]
    assert len(integrated) == 1
    assert "evidence" in integrated[0]
    assert integrated[0]["evidence"]["shared_possession_minutes"] == 120


def test_identical_requests_yield_identical_plan_and_response(client):
    payload = {
        "request": request_payload(task_ids=["T1", "T2"]),
        "context": context_payload([build_task("T1"), build_task("T2")]),
    }
    first = client.post("/api/optimizer/generate", json=payload)
    second = client.post("/api/optimizer/generate", json=payload)
    assert first.status_code == second.status_code == 200
    assert first.json()["plan_id"] == second.json()["plan_id"]
    assert first.json() == second.json()


def test_deterministic_candidate_and_explanation_order(client):
    payload = {
        "request": request_payload(task_ids=["T1", "T2"]),
        "context": context_payload([build_task("T1"), build_task("T2")]),
    }
    candidates_a = client.post("/api/optimizer/candidates", json={"context": payload["context"]}).json()
    candidates_b = client.post("/api/optimizer/candidates", json={"context": payload["context"]}).json()
    assert candidates_a == candidates_b

    plan_a = client.post("/api/optimizer/generate", json=payload).json()
    plan_b = client.post("/api/optimizer/generate", json=payload).json()
    assert [r["subject_id"] for r in plan_a["explanations"]["records"]] == [
        r["subject_id"] for r in plan_b["explanations"]["records"]
    ]


def test_per_request_settings_override_generation(client):
    baseline = generate(
        client,
        request=request_payload(task_ids=["T1"]),
        context=context_payload([build_task("T1")]),
    )
    overridden = generate(
        client,
        request=request_payload(task_ids=["T1"]),
        context=context_payload([build_task("T1")]),
        settings={"max_candidates_per_task": 2},
    )
    assert overridden["plan_id"] != baseline["plan_id"]
    assert overridden["schedule"] != baseline["schedule"]


def test_settings_override_caps_candidate_generation(client):
    response = client.post(
        "/api/optimizer/candidates",
        json={
            "context": context_payload([build_task("T1")]),
            "settings": {"max_candidates_per_task": 2},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["candidate_count"] == 2


def test_unscheduled_task_preserves_rejection_context(client):
    plan = generate(
        client,
        request=request_payload(request_id="REQ-OVLD", task_ids=["T1", "T2"]),
        context=context_payload(
            [
                build_task("T1"),
                build_task(
                    "T2",
                    window_start=NOW,
                    window_end=NOW + timedelta(minutes=30),
                ),
            ]
        ),
    )
    assert plan["solver_status"] == "OPTIMAL"
    assert plan["schedule"]["scheduled_task_ids"] == ["T1"]
    assert plan["schedule"]["unscheduled_task_ids"] == ["T2"]

    records = {record["subject_id"]: record for record in plan["explanations"]["records"]}
    assert records["T2"]["subject_type"] == "UNSCHEDULED_TASK"
    assert records["T2"]["reason_codes"]