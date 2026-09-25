"""Demo API read-back contract (Phase 7B/7C).

The synthetic demo world driven over the real HTTP layer. ``POST
/api/optimizer/generate`` is fed a payload from :func:`demo_data.demo_generate_payload`
and the response is read back field-by-field against the verified app contract.

Nothing here inspects live Indian Railways data: the demo material is
SYNTHETIC_DEMO and deterministic. Storage is IN_MEMORY (plans live for the
lifetime of the process/app instance).
"""

import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from demo_data import demo_generate_payload


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app(Settings(demo_mode=True)))


def _post_generate(client: TestClient) -> dict:
    response = client.post(
        "/api/optimizer/generate", json=demo_generate_payload(0)
    )
    assert response.status_code == 200
    return response.json()


def test_generate_returns_the_documented_top_level_shape(client):
    plan = _post_generate(client)
    assert set(plan) == {
        "candidates",
        "data_mode",
        "explanations",
        "integrated_candidates",
        "meta",
        "metrics",
        "plan_id",
        "request_id",
        "schedule",
        "solver_status",
        "storage",
        "validation",
    }
    assert plan["plan_id"].startswith("PLAN-")
    assert plan["request_id"].startswith("BRQ-")
    assert plan["data_mode"] == "SYNTHETIC_DEMO"
    assert plan["storage"] == "IN_MEMORY"
    assert plan["solver_status"] in {"OPTIMAL", "FEASIBLE"}


def test_schedule_and_metrics_readback(client):
    plan = _post_generate(client)

    schedule = plan["schedule"]
    assert set(schedule) == {
        "message",
        "objective_value",
        "schedule_id",
        "scheduled_task_ids",
        "selected_blocks",
        "solver_metadata",
        "status",
        "unscheduled_task_ids",
        "unscheduled_tasks",
    }
    assert schedule["schedule_id"].startswith("SCHED-")
    assert schedule["scheduled_task_ids"]
    assert schedule["status"] in {"OPTIMAL", "FEASIBLE"}

    metrics = plan["metrics"]
    assert set(metrics) == {
        "average_possession_minutes",
        "block_consolidation_ratio",
        "conflicts_resolved",
        "extra",
        "integrated_blocks_count",
        "resource_utilisation_percent",
        "scheduled_urgent_tasks",
        "slot_utilisation_percent",
        "task_coverage_ratio",
        "total_tasks_requested",
        "total_tasks_scheduled",
        "unscheduled_urgent_tasks",
        "validation_accuracy_percent",
    }
    assert metrics["total_tasks_scheduled"] >= 1
    assert 0.0 <= metrics["task_coverage_ratio"] <= 1.0


def test_validation_and_explanations_readback(client):
    plan = _post_generate(client)

    validation = plan["validation"]
    assert set(validation) == {
        "checked_block_count",
        "checked_task_count",
        "errors",
        "metadata",
        "schedule_id",
        "solver_status",
        "valid",
        "warnings",
    }
    assert validation["valid"] is True
    assert validation["errors"] == []

    explanations = plan["explanations"]
    assert set(explanations) == {
        "metadata",
        "records",
        "schedule_id",
        "schedule_valid",
        "solver_status",
        "validation_provided",
    }
    records = explanations["records"]
    assert records
    for record in records:
        assert set(record) == {
            "details",
            "evidence",
            "metadata",
            "reason_codes",
            "status",
            "subject_id",
            "subject_type",
            "summary",
        }
        assert record["subject_id"]
        assert record["summary"]


def test_candidates_readback(client):
    plan = _post_generate(client)
    candidates = plan["candidates"]
    assert candidates
    for candidate in candidates:
        assert {"candidate_id", "corridor_id", "section", "task_ids"} <= set(candidate)


def test_identical_payload_replays_identical_plan(client):
    first = _post_generate(client)
    second = _post_generate(client)
    assert first["plan_id"] == second["plan_id"]
    assert first["schedule"] == second["schedule"]
    assert first["metrics"] == second["metrics"]
    assert first["explanations"] == second["explanations"]


def test_metrics_route_roundtrips_the_plan_stats(client):
    plan = _post_generate(client)
    plan_id = plan["plan_id"]
    response = client.get(f"/api/optimizer/plans/{plan_id}/metrics")
    assert response.status_code == 200
    body = response.json()
    assert body["plan_id"] == plan_id
    assert body["metrics"]["total_tasks_scheduled"] == plan["metrics"]["total_tasks_scheduled"]
