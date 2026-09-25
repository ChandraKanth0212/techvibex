"""Phase 7A integration tests: HTTP routing, contracts and error behaviour.

Covers the ``/api/optimizer`` endpoints (request/response moulds, structured
errors, deterministic ordering). The full generate flow and the determinism
contract across identical requests live in ``test_api_pipeline_e2e.py``.

Starlette's ServerErrorMiddleware re-raises exceptions after sending a 500
response, so the internal-error path is exercised with
``raise_server_exceptions=False``.
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


def request_payload(request_id="REQ-API", task_ids=("T1",)):
    return sample_block_request(
        request_id=request_id,
        task_ids=list(task_ids),
        requested_start=NOW,
        requested_end=NOW + timedelta(hours=3),
    ).model_dump(mode="json")


def assert_error(response, status_code, code):
    assert response.status_code == status_code
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == code
    assert body["error"]["message"]


# 1. health is reachable and describes the demo data mode
def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["module"] == "optimization-engine"
    assert body["dataMode"] == "SYNTHETIC_DEMO"


# 2. candidates endpoint returns generated + rejected candidates, wins-free
def test_candidates_returns_generated_and_rejected_candidates(client):
    tasks = [build_task("T1"), build_task("T2")]
    response = client.post(
        "/api/optimizer/candidates", json={"context": context_payload(tasks)}
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body["task_ids"]) == {"T1", "T2"}
    assert body["candidate_count"] > 0
    assert body["feasible_count"] + body["rejected_count"] == body["candidate_count"]
    assert isinstance(body["rejection_codes"], dict)
    assert body["candidates"] and all(
        candidate["rejected"] is False for candidate in body["candidates"]
    )


def test_candidates_ordered_deterministically_by_candidate_id(client):
    tasks = [build_task("T1"), build_task("T2")]
    payload = {"context": context_payload(tasks)}
    first = client.post("/api/optimizer/candidates", json=payload).json()
    second = client.post("/api/optimizer/candidates", json=payload).json()
    ids = [candidate["candidate_id"] for candidate in first["candidates"]]
    assert ids == sorted(ids)
    assert first == second


def test_candidates_scope_task_ids(client):
    tasks = [build_task("T1"), build_task("T2")]
    response = client.post(
        "/api/optimizer/candidates",
        json={"context": context_payload(tasks), "task_ids": ["T1"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["task_ids"] == ["T1"]
    assert all(
        candidate["task_ids"] == ["T1"] for candidate in body["candidates"]
    )


def test_candidates_empty_context_is_400(client):
    assert_error(
        client.post("/api/optimizer/candidates", json={"context": {}}),
        400,
        "EMPTY_CONTEXT",
    )


def test_candidates_unknown_task_reference_is_400(client):
    assert_error(
        client.post(
            "/api/optimizer/candidates",
            json={"context": context_payload([build_task("T1")]), "task_ids": ["GHOST"]},
        ),
        400,
        "UNKNOWN_TASK_REFERENCED",
    )


# 3. integrated-blocks discovery endpoint
def test_discover_detects_compatible_pair(client):
    tasks = [build_task("T1"), build_task("T2")]
    response = client.post(
        "/api/optimizer/integrated-blocks/discover",
        json={"context": context_payload(tasks)},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["groups_examined"] >= 1
    assert body["compatible_count"] >= 1
    assert isinstance(body["rejection_codes"], dict)
    compatible = [
        candidate
        for candidate in body["candidates"]
        if candidate["compatibility"] == "COMPATIBLE"
    ]
    assert compatible
    block = compatible[0]
    assert set(block["task_ids"]) == {"T1", "T2"}
    assert block["window_start"] is not None
    assert block["window_end"] is not None
    assert block["total_required_duration_minutes"] == 120


def test_discover_accepts_single_task_context(client):
    response = client.post(
        "/api/optimizer/integrated-blocks/discover",
        json={"context": context_payload([build_task("T1")])},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["compatible_count"] >= 0
    assert isinstance(body["rejection_codes"], dict)


# 4. validate is a pure validator: it never invokes the optimizer
def test_validate_pure_validator_without_optimizing(client):
    generate = client.post(
        "/api/optimizer/generate",
        json={"request": request_payload(), "context": context_payload([build_task("T1")])},
    )
    assert generate.status_code == 200
    plan = generate.json()
    schedule = plan["schedule"]

    response = client.post(
        "/api/optimizer/validate",
        json={"schedule": schedule, "context": context_payload([build_task("T1")])},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["schedule_id"] == schedule["schedule_id"]
    assert body["solver_status"] == plan["solver_status"]
    assert body["valid"] is True
    assert body["error_count"] == 0
    assert isinstance(body["errors"], list)


def test_validate_empty_context_is_400(client):
    assert_error(
        client.post(
            "/api/optimizer/validate",
            json={"schedule": {"schedule_id": "S", "status": "OPTIMAL"}, "context": {}},
        ),
        400,
        "EMPTY_CONTEXT",
    )


# 5. plan store: GET / metadata endpoints and unknown ids
def test_generated_plan_is_retrievable_with_metrics_and_conflicts(client):
    plan = client.post(
        "/api/optimizer/generate",
        json={
            "request": request_payload(task_ids=["T1", "T2"]),
            "context": context_payload([build_task("T1"), build_task("T2")]),
        },
    ).json()

    get_plan = client.get(f"/api/optimizer/plans/{plan['plan_id']}")
    assert get_plan.status_code == 200
    assert get_plan.json() == plan

    metrics = client.get(f"/api/optimizer/plans/{plan['plan_id']}/metrics")
    assert metrics.status_code == 200
    assert metrics.json()["plan_id"] == plan["plan_id"]
    assert metrics.json()["metrics"]["total_tasks_scheduled"] == 2

    conflicts = client.get(f"/api/optimizer/plans/{plan['plan_id']}/conflicts")
    assert conflicts.status_code == 200
    assert conflicts.json()["solver_status"] == plan["solver_status"]
    assert conflicts.json()["validation_valid"] is True
    assert conflicts.json()["error_count"] == 0


def test_unknown_plan_id_returns_404_envelope(client):
    assert_error(client.get("/api/optimizer/plans/NOPE"), 404, "NOT_FOUND")
    assert_error(
        client.get("/api/optimizer/plans/NOPE/metrics"), 404, "NOT_FOUND"
    )
    assert_error(
        client.get("/api/optimizer/plans/NOPE/conflicts"), 404, "NOT_FOUND"
    )


# 6. transport errors are structured and symmetric
def test_malformed_json_payload_returns_422_envelope(client):
    response = client.post(
        "/api/optimizer/generate",
        json={"request": request_payload(), "context": {"tasks": "nope"}},
    )
    assert_error(response, 422, "REQUEST_VALIDATION")


def test_invalid_settings_value_returns_422_envelope(client):
    assert_error(
        client.post(
            "/api/optimizer/generate",
            json={
                "request": request_payload(),
                "context": context_payload([build_task("T1")]),
                "settings": {"solver_timeout_seconds": 0},
            },
        ),
        422,
        "REQUEST_VALIDATION",
    )


def test_generate_missing_context_and_request_is_400(client):
    assert_error(
        client.post(
            "/api/optimizer/generate",
            json={"request": request_payload(), "context": {}},
        ),
        400,
        "EMPTY_CONTEXT",
    )
    assert_error(
        client.post("/api/optimizer/generate", json={"request": request_payload()}),
        400,
        "EMPTY_CONTEXT",
    )


def test_generate_without_request_needs_context_blocks(client):
    assert_error(
        client.post(
            "/api/optimizer/generate",
            json={"context": context_payload([build_task("T1")])},
        ),
        400,
        "REQUEST_REQUIRED",
    )


def test_generate_resolves_request_from_context_blocks(client):
    context = PlanningContext.from_dict(
        make_planning_context(
            tasks=[build_task("T1")],
            block_requests=[sample_block_request(task_ids=["T1"])],
        )
    ).model_dump(mode="json")
    response = client.post("/api/optimizer/generate", json={"context": context})
    assert response.status_code == 200
    assert response.json()["solver_status"] in {"OPTIMAL", "FEASIBLE"}


def test_unexpected_internal_error_returns_500_envelope(monkeypatch):
    application = create_app(settings=Settings())

    def explode(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(application.state.pipeline, "build_candidates", explode)
    client = TestClient(application, raise_server_exceptions=False)
    response = client.post(
        "/api/optimizer/candidates",
        json={"context": context_payload([build_task("T1")])},
    )
    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "boom" not in body["error"]["message"]