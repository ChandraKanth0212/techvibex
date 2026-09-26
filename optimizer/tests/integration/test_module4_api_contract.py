"""Contract tests for the stable Module 3 to Module 4 API boundary."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from app.core.context import PlanningContext
from app.schemas.api import ErrorResponse, PlanResponse, ScheduleDTO
from tests.helpers import NOW, make_planning_context, sample_block_request, sample_task


TOP_LEVEL_KEYS = {
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
SCHEDULE_KEYS = {
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
SELECTED_BLOCK_KEYS = {
    "block_id",
    "block_type",
    "corridor_id",
    "duration_minutes",
    "end_time",
    "integrated",
    "participating_departments",
    "request_ids",
    "resources",
    "section",
    "start_time",
    "status",
    "task_ids",
}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app(settings=Settings()))


def _task(task_id: str):
    return sample_task(
        task_id=task_id,
        window_start=NOW,
        window_end=NOW + timedelta(hours=3),
        estimated_duration_minutes=60,
        required_resources=[],
    )


def _context(task_ids=("T1",)):
    return PlanningContext.from_dict(
        make_planning_context(tasks=[_task(task_id) for task_id in task_ids])
    ).model_dump(mode="json")


def _request(request_id="REQ-CONTRACT", task_ids=("T1",)):
    return sample_block_request(
        request_id=request_id,
        task_ids=list(task_ids),
        requested_start=NOW,
        requested_end=NOW + timedelta(hours=3),
    ).model_dump(mode="json")


def _generate(client: TestClient, task_ids=("T1",), request_id="REQ-CONTRACT"):
    response = client.post(
        "/api/optimizer/generate",
        json={"request": _request(request_id, task_ids), "context": _context(task_ids)},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_generate_uses_only_stable_dto_shapes(client):
    plan = _generate(client)

    assert set(plan) == TOP_LEVEL_KEYS
    assert set(plan["schedule"]) == SCHEDULE_KEYS
    assert plan["schedule"]["selected_blocks"]
    for block in plan["schedule"]["selected_blocks"]:
        assert set(block) == SELECTED_BLOCK_KEYS
        assert block["status"] == "SCHEDULED"
        assert block["request_ids"] == ["REQ-CONTRACT"]
        assert block["duration_minutes"] > 0

    parsed = PlanResponse.model_validate(plan)
    assert isinstance(parsed.schedule, ScheduleDTO)
    assert parsed.request_id == "REQ-CONTRACT"


def test_candidate_and_integrated_outputs_are_stable_dtos(client):
    candidates_response = client.post(
        "/api/optimizer/candidates", json={"context": _context(("T1", "T2"))}
    )
    assert candidates_response.status_code == 200, candidates_response.text
    candidates = candidates_response.json()
    assert set(candidates) == {
        "candidate_count",
        "candidates",
        "data_mode",
        "feasible_count",
        "rejected_count",
        "rejection_codes",
        "storage",
        "task_ids",
    }
    assert candidates["candidates"]
    assert set(candidates["candidates"][0]) == {
        "candidate_id",
        "corridor_id",
        "duration_minutes",
        "end_time",
        "feasible",
        "metadata",
        "rejected",
        "section",
        "start_time",
        "task_ids",
        "violations",
    }

    integrated_response = client.post(
        "/api/optimizer/integrated-blocks/discover",
        json={"context": _context(("T1", "T2"))},
    )
    assert integrated_response.status_code == 200, integrated_response.text
    integrated = integrated_response.json()
    assert set(integrated) == {
        "candidates",
        "compatible_count",
        "data_mode",
        "groups_examined",
        "rejection_codes",
        "storage",
        "task_ids",
    }
    assert integrated["candidates"]
    assert set(integrated["candidates"][0]) == {
        "block_id",
        "compatibility",
        "corridor_id",
        "earliest_feasible_start",
        "latest_feasible_end",
        "metadata",
        "participating_departments",
        "request_ids",
        "section",
        "task_ids",
        "total_required_duration_minutes",
        "violations",
        "window_end",
        "window_start",
    }


def test_dto_schedule_can_be_validated_without_internal_contracts(client):
    plan = _generate(client)
    response = client.post(
        "/api/optimizer/validate",
        json={"schedule": plan["schedule"], "context": _context()},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {
        "checked_block_count",
        "checked_task_count",
        "error_count",
        "errors",
        "metadata",
        "schedule_id",
        "solver_status",
        "valid",
        "warning_count",
        "warnings",
    }
    assert body["schedule_id"] == plan["schedule"]["schedule_id"]
    assert body["valid"] is True


def test_runtime_solver_metadata_is_not_part_of_the_stored_dto(client):
    first = _generate(client)
    second = _generate(client)

    assert first == second
    metadata = first["schedule"]["solver_metadata"]
    assert not {
        "created_at",
        "elapsed_seconds",
        "generated_at",
        "presolve_solve_time_seconds",
        "runtime_seconds",
        "solve_duration_seconds",
        "solve_time_seconds",
        "timed_out",
        "wall_time_seconds",
    } & set(metadata)
    assert first["plan_id"] == second["plan_id"]


def test_error_envelope_has_request_id_without_internal_details(client):
    response = client.post(
        "/api/optimizer/generate",
        json={"request": _request("REQ-ERROR"), "context": {"tasks": "invalid"}},
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert set(error) == {"code", "details", "message", "request_id"}
    assert error["code"] == "REQUEST_VALIDATION"
    assert error["request_id"] == "REQ-ERROR"
    assert "Traceback" not in error["message"]

    header_response = client.get(
        "/api/optimizer/plans/MISSING", headers={"x-request-id": "REQ-HEADER"}
    )
    assert header_response.status_code == 404
    assert header_response.json()["error"]["request_id"] == "REQ-HEADER"


def test_openapi_response_models_are_api_dtos(client):
    schemas = client.get("/openapi.json").json()["components"]["schemas"]

    assert "PlanResponse" in schemas
    assert "ScheduleDTO" in schemas
    assert "ScheduleResult" not in schemas
    assert "ScheduleBlock" not in schemas


def test_openapi_documents_the_error_dto_for_every_pipeline_route(client):
    document = client.get("/openapi.json").json()
    schemas = document["components"]["schemas"]

    assert set(schemas["ErrorResponse"]["required"]) == {"error"}
    assert set(schemas["ErrorDetailDTO"]["properties"]) == {
        "code",
        "details",
        "message",
        "request_id",
    }

    documented = set()
    for path, operations in document["paths"].items():
        if not path.startswith("/api/optimizer"):
            continue
        for method, operation in operations.items():
            for status, response in operation["responses"].items():
                assert response["description"], (path, method, status)
                if status == "200":
                    continue
                assert (
                    response["content"]["application/json"]["schema"]["$ref"]
                    == "#/components/schemas/ErrorResponse"
                ), (path, method, status)
                documented.add(status)

    # The envelope is advertised, not FastAPI's default validation model.
    assert documented == {"400", "404", "409", "422", "500"}


def test_every_error_envelope_validates_against_the_published_dto(client):
    plan_id = _generate(client)["plan_id"]
    stripped = PlanResponse.model_validate(
        client.get(f"/api/optimizer/plans/{plan_id}").json()
    ).model_copy(update={"metrics": None, "validation": None})
    client.app.state.plan_store.put(stripped)

    responses = [
        client.post("/api/optimizer/candidates", json={"context": {}}),
        client.post(
            "/api/optimizer/candidates",
            json={"context": _context(), "task_ids": ["GHOST"]},
        ),
        client.get("/api/optimizer/plans/MISSING"),
        client.get(f"/api/optimizer/plans/{plan_id}/metrics"),
        client.get(f"/api/optimizer/plans/{plan_id}/conflicts"),
        client.post(
            "/api/optimizer/generate",
            json={"request": _request("REQ-ERROR"), "context": {"tasks": "invalid"}},
        ),
    ]
    assert [response.status_code for response in responses] == [400, 400, 404, 409, 409, 422]

    for response in responses:
        body = response.json()
        assert ErrorResponse.model_validate(body).model_dump(mode="json") == body
        assert body["error"]["code"]
        assert body["error"]["message"]
