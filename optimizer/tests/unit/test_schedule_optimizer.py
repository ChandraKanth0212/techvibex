"""Unit tests for the CP-SAT ScheduleOptimizer (Phase 3B)."""

from datetime import date, timedelta

from app.core.config import ObjectiveWeights, Settings
from app.services.schedule_optimizer import ScheduleOptimizer, _map_cp_status, cp_model
from contracts import AIRecommendation, BlockRequest, PriorityLevel
from tests.helpers import (
    NOW,
    make_planning_context,
    sample_block_request,
    sample_existing_block,
    sample_goods_forecast,
    sample_resource,
    sample_task,
    sample_train_movement,
)


def _optimizer(**weight_overrides) -> ScheduleOptimizer:
    weights = ObjectiveWeights(**weight_overrides)
    return ScheduleOptimizer(settings=Settings(objective_weights=weights))


def _req(task_ids, request_id="REQ-001"):
    return sample_block_request(request_id=request_id, task_ids=task_ids)


def _conflicting_tasks():
    """Two tasks that cannot both be scheduled in one window model."""
    window = (NOW, NOW + timedelta(hours=2))
    return [
        sample_task(task_id="T1", window_start=window[0], window_end=window[1]),
        sample_task(task_id="T2", window_start=window[0], window_end=window[1]),
    ]


def test_single_feasible_task_scheduled():
    task = sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2))
    result = _optimizer().optimize(_req(["T1"]), make_planning_context(tasks=[task]))

    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == ["T1"]
    assert len(result.selected_blocks) == 1
    block = result.selected_blocks[0]
    assert block.block_type == "SINGLE"
    assert block.task_ids == ["T1"]
    assert block.end_time > block.start_time
    assert result.objective_value > 0
    assert result.unscheduled_task_ids == []
    assert result.solver_metadata["scheduled_task_count"] == 1


def test_two_non_conflicting_tasks_scheduled():
    tasks = [
        sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2)),
        sample_task(
            task_id="T2",
            asset_id="AST-002",
            window_start=NOW + timedelta(hours=3),
            window_end=NOW + timedelta(hours=5),
            metadata={"section": "S2"},
        ),
    ]
    result = _optimizer().optimize(_req(["T1", "T2"]), make_planning_context(tasks=tasks))

    assert result.status == "OPTIMAL"
    assert set(result.scheduled_task_ids) == {"T1", "T2"}
    assert len(result.selected_blocks) == 2


def test_conflicting_candidates_not_both_selected():
    result = _optimizer().optimize(
        _req(["T1", "T2"]), make_planning_context(tasks=_conflicting_tasks())
    )
    assert result.status == "OPTIMAL"
    assert not ({"T1", "T2"} <= set(result.scheduled_task_ids))
    assert len(result.scheduled_task_ids) == 1


def test_same_task_not_selected_twice():
    task = sample_task(
        task_id="T1",
        estimated_duration_minutes=60,
        window_start=NOW,
        window_end=NOW + timedelta(hours=6),
    )
    result = _optimizer().optimize(_req(["T1"]), make_planning_context(tasks=[task]))

    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == ["T1"]
    covering = [b for b in result.selected_blocks if "T1" in b.task_ids]
    assert len(covering) == 1


def test_integrated_block_schedules_all_member_tasks():
    window = (NOW, NOW + timedelta(hours=4))
    tasks = [
        sample_task(task_id=f"T{i}", estimated_duration_minutes=60,
                    window_start=window[0], window_end=window[1])
        for i in range(1, 4)
    ]
    result = _optimizer(slot_consolidation=2.0).optimize(
        _req(["T1", "T2", "T3"], request_id="REQ-IB"),
        make_planning_context(tasks=tasks),
    )

    assert result.status == "OPTIMAL"
    assert set(result.scheduled_task_ids) == {"T1", "T2", "T3"}
    assert len(result.selected_blocks) == 1
    block = result.selected_blocks[0]
    assert block.block_type == "INTEGRATED"
    assert set(block.task_ids) == {"T1", "T2", "T3"}
    assert len(block.source_candidate_ids) >= 3


def test_priority_preference_with_configured_weights():
    tasks = _conflicting_tasks()
    priorities = [
        AIRecommendation(
            task_id="T1", priority_score=90.0, recommended_priority=PriorityLevel.URGENT,
            confidence=0.95,
        ),
        AIRecommendation(
            task_id="T2", priority_score=10.0, recommended_priority=PriorityLevel.LOW,
            confidence=0.95,
        ),
    ]
    context = make_planning_context(tasks=tasks, priorities=priorities)
    result = _optimizer(priority_adherence=4.0).optimize(_req(["T1", "T2"]), context)

    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == ["T1"]
    assert result.solver_metadata["priority_source"] == "ai"


def test_urgent_task_is_mandatory_when_candidates_exist():
    tasks = [
        sample_task(task_id="T1", priority=PriorityLevel.URGENT,
                    window_start=NOW, window_end=NOW + timedelta(hours=2)),
        sample_task(task_id="T2", priority=PriorityLevel.LOW,
                    window_start=NOW, window_end=NOW + timedelta(hours=2)),
    ]
    result = _optimizer().optimize(_req(["T1", "T2"]), make_planning_context(tasks=tasks))

    assert result.status == "OPTIMAL"
    assert "T1" in result.scheduled_task_ids
    assert result.solver_metadata["mandatory_urgent_tasks"] == ["T1"]


def test_overdue_task_preferred_with_configured_weight():
    tasks = _conflicting_tasks()
    tasks[0] = tasks[0].model_copy(update={"due_by": NOW.date() - timedelta(days=5)})
    context = make_planning_context(tasks=tasks)
    result = _optimizer(overdue_reduction=4.0).optimize(_req(["T1", "T2"]), context)

    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == ["T1"]


def test_resource_capacity_one_blocks_second_user():
    tasks = [
        sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2)),
        sample_task(
            task_id="T2",
            asset_id="AST-002",
            metadata={"section": "S2"},
            window_start=NOW,
            window_end=NOW + timedelta(hours=2),
        ),
    ]
    context = make_planning_context(
        tasks=tasks, resources=[sample_resource(resource_id="RES-001")]
    )
    result = _optimizer().optimize(_req(["T1", "T2"]), context)

    assert result.status == "OPTIMAL"
    assert len(result.scheduled_task_ids) == 1
    assert not ({"T1", "T2"} <= set(result.scheduled_task_ids))
    unscheduled = [t for t in result.unscheduled_tasks if t.task_id in {"T1", "T2"}]
    assert len(unscheduled) == 1
    assert "not selected" in unscheduled[0].reason


def test_existing_block_conflict_respected():
    task = sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2))
    context = make_planning_context(
        tasks=[task],
        existing_blocks=[sample_existing_block(block_id="BLK-X", start_time=NOW, end_time=NOW + timedelta(hours=3))],
    )
    result = _optimizer().optimize(_req(["T1"]), context)

    assert result.status == "UNKNOWN"
    assert result.scheduled_task_ids == []
    assert "T1" in result.unscheduled_task_ids
    info = next(t for t in result.unscheduled_tasks if t.task_id == "T1")
    assert "EXISTING_BLOCK_CONFLICT" in info.rejection_codes


def test_train_conflict_respected():
    task = sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2))
    context = make_planning_context(
        tasks=[task],
        train_movements=[sample_train_movement()],
    )
    result = _optimizer().optimize(_req(["T1"]), context)

    assert result.status == "UNKNOWN"
    assert result.scheduled_task_ids == []
    info = next(t for t in result.unscheduled_tasks if t.task_id == "T1")
    assert "TRAIN_CONFLICT" in info.rejection_codes


def test_no_priority_data_uses_documented_fallback():
    task = sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2))
    result = _optimizer().optimize(_req(["T1"]), make_planning_context(tasks=[task]))

    assert result.status == "OPTIMAL"
    assert result.solver_metadata["priority_source"] == "task_priority_fallback"


def test_goods_elevation_penalty_steers_choice():
    goods = sample_goods_forecast(
        forecast_id="FCST-1",
        date=NOW.date(),
        window_start=NOW.time(),
        window_end=(NOW + timedelta(hours=2)).time(),
        probability=0.75,
    )
    tasks = [
        sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2)),
        sample_task(
            task_id="T2",
            asset_id="AST-002",
            metadata={"section": "S2"},
            window_start=NOW,
            window_end=NOW + timedelta(hours=2),
        ),
    ]
    context = make_planning_context(
        tasks=tasks,
        goods_forecasts=[goods],
        resources=[sample_resource(resource_id="RES-001")],
    )
    result = _optimizer(forecast_alignment=3.0).optimize(_req(["T1", "T2"]), context)

    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == ["T2"]
    assert "T1" in result.unscheduled_task_ids


def test_status_mapping_optimal():
    assert _map_cp_status(cp_model.OPTIMAL) == "OPTIMAL"


def test_status_mapping_never_labels_feasible_as_optimal():
    assert _map_cp_status(cp_model.FEASIBLE) == "FEASIBLE"
    assert _map_cp_status(cp_model.FEASIBLE) != "OPTIMAL"


def test_status_mapping_infeasible_error_unknown():
    assert _map_cp_status(cp_model.INFEASIBLE) == "INFEASIBLE"
    assert _map_cp_status(cp_model.MODEL_INVALID) == "ERROR"
    assert _map_cp_status(cp_model.UNKNOWN) == "UNKNOWN"


def test_mandatory_conflict_yields_infeasible():
    tasks = [
        sample_task(task_id="T1", priority=PriorityLevel.URGENT,
                    window_start=NOW, window_end=NOW + timedelta(hours=2)),
        sample_task(task_id="T2", priority=PriorityLevel.URGENT,
                    window_start=NOW, window_end=NOW + timedelta(hours=2)),
    ]
    result = _optimizer().optimize(_req(["T1", "T2"]), make_planning_context(tasks=tasks))

    assert result.status == "INFEASIBLE"
    assert result.selected_blocks == []
    assert result.scheduled_task_ids == []
    assert set(result.unscheduled_task_ids) == {"T1", "T2"}
    assert result.solver_metadata["model_infeasible"] is True


def test_solver_output_is_deterministic():
    window = (NOW, NOW + timedelta(hours=3))
    tasks = [
        sample_task(task_id=f"T{i}", window_start=window[0], window_end=window[1])
        for i in range(1, 4)
    ]
    context = make_planning_context(tasks=tasks)
    optimizer = _optimizer()
    first = optimizer.optimize(_req(["T1", "T2", "T3"]), context)
    second = optimizer.optimize(_req(["T1", "T2", "T3"]), context)

    def projection(result) -> dict:
        payload = result.model_dump(mode="json")
        payload["solver_metadata"].pop("solve_time_seconds", None)
        return payload

    assert projection(first) == projection(second)
    assert first.objective_value == second.objective_value


def test_unscheduled_task_returned_with_information():
    result = _optimizer().optimize(
        _req(["T1", "T2"]), make_planning_context(tasks=_conflicting_tasks())
    )
    unscheduled = result.unscheduled_tasks
    assert len(unscheduled) == 1
    info = unscheduled[0]
    assert info.scheduled is False
    assert info.candidate_count >= 1
    assert info.feasible_candidate_count >= 1
    assert "not selected" in info.reason
    assert info.rejection_codes == []


def test_request_referencing_unknown_task_is_error():
    tasks = _conflicting_tasks()
    result = _optimizer().optimize(_req(["T1", "GHOST"]), make_planning_context(tasks=tasks))

    assert result.status == "ERROR"
    assert "GHOST" in result.message
    assert result.scheduled_task_ids == []


def test_empty_context_is_error():
    result = _optimizer().optimize(
        _req(["T1"]), make_planning_context(tasks=[])
    )
    assert result.status == "ERROR"
    assert "no tasks" in result.message


def test_to_optimization_result_bridge():
    task = sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2))
    result = _optimizer().optimize(_req(["T1"]), make_planning_context(tasks=[task]))

    legacy = result.to_optimization_result()
    assert legacy.status == result.status
    assert legacy.solution.solution_id == result.schedule_id
    assert legacy.solution.blocks
    assert legacy.runtime_seconds >= 0