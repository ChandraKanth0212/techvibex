"""End-to-end scheduling scenarios combining pipelines (Phase 3B)."""

from datetime import timedelta

from app.core.config import ObjectiveWeights, Settings
from app.services.schedule_optimizer import ScheduleOptimizer
from contracts import PriorityLevel
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


def _overlaps(a_start, a_end, b_start, b_end) -> bool:
    return a_start < b_end and b_start < a_end


def test_integration_with_train_blocked_task():
    train = sample_train_movement(
        movement_id="MOV-1", train_number="11007",
        departure=NOW, arrival=NOW + timedelta(hours=2),
    )
    tasks = [
        sample_task(task_id="T1", estimated_duration_minutes=60,
                    window_start=NOW + timedelta(hours=3), window_end=NOW + timedelta(hours=7)),
        sample_task(task_id="T2", estimated_duration_minutes=60,
                    window_start=NOW + timedelta(hours=3), window_end=NOW + timedelta(hours=7)),
        sample_task(task_id="T3", window_start=NOW, window_end=NOW + timedelta(hours=3)),
    ]
    context = make_planning_context(tasks=tasks, train_movements=[train])
    result = _optimizer(slot_consolidation=2.0).optimize(
        sample_block_request(request_id="REQ-1", task_ids=["T1", "T2", "T3"]), context
    )

    assert result.status == "OPTIMAL"
    assert set(result.scheduled_task_ids) == {"T1", "T2"}
    assert "T3" in result.unscheduled_task_ids
    t3_info = next(info for info in result.unscheduled_tasks if info.task_id == "T3")
    assert "TRAIN_CONFLICT" in t3_info.rejection_codes

    assert len(result.selected_blocks) == 1
    block = result.selected_blocks[0]
    assert block.block_type == "INTEGRATED"
    assert set(block.task_ids) == {"T1", "T2"}
    assert not _overlaps(block.start_time, block.end_time, train.departure, train.arrival)


def test_urgent_task_scheduled_around_existing_block():
    existing = sample_existing_block(
        block_id="BLK-1", start_time=NOW, end_time=NOW + timedelta(hours=1)
    )
    tasks = [
        sample_task(task_id="T1", priority=PriorityLevel.URGENT, estimated_duration_minutes=60,
                    window_start=NOW, window_end=NOW + timedelta(hours=4)),
        sample_task(task_id="T2", estimated_duration_minutes=60,
                    window_start=NOW, window_end=NOW + timedelta(hours=4),
                    asset_id="AST-002", metadata={"section": "S2"}),
    ]
    context = make_planning_context(tasks=tasks, existing_blocks=[existing])
    result = _optimizer().optimize(
        sample_block_request(request_id="REQ-2", task_ids=["T1", "T2"]), context
    )

    assert result.status == "OPTIMAL"
    assert set(result.scheduled_task_ids) == {"T1", "T2"}
    t1_block = next(b for b in result.selected_blocks if "T1" in b.task_ids)
    assert not _overlaps(t1_block.start_time, t1_block.end_time, existing.start_time, existing.end_time)


def test_mixed_world_schedule_has_no_conflicts_and_is_deterministic():
    tasks = [
        sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2)),
        sample_task(task_id="T2", estimated_duration_minutes=60,
                    window_start=NOW + timedelta(hours=4), window_end=NOW + timedelta(hours=8)),
        sample_task(task_id="T3", estimated_duration_minutes=60,
                    window_start=NOW + timedelta(hours=4), window_end=NOW + timedelta(hours=8)),
    ]
    goods = sample_goods_forecast(
        forecast_id="FCST-1",
        date=(NOW + timedelta(hours=4)).date(),
        window_start=(NOW + timedelta(hours=4)).time(),
        window_end=(NOW + timedelta(hours=8)).time(),
        probability=0.70,
    )
    context = make_planning_context(
        tasks=tasks,
        goods_forecasts=[goods],
        resources=[sample_resource(resource_id="RES-001")],
    )
    shared_req = sample_block_request(request_id="REQ-3", task_ids=["T1", "T2", "T3"])
    optimizer = _optimizer(slot_consolidation=2.0, forecast_alignment=3.0)

    first = optimizer.optimize(shared_req, context)
    second = optimizer.optimize(shared_req, context)

    assert first.status in ("OPTIMAL", "FEASIBLE")
    assert first.status == second.status
    assert first.objective_value > 0

    def projection(result) -> dict:
        payload = result.model_dump(mode="json")
        payload["solver_metadata"].pop("solve_time_seconds", None)
        return payload

    assert projection(first) == projection(second)

    for i in range(len(first.selected_blocks)):
        for j in range(i + 1, len(first.selected_blocks)):
            a, b = first.selected_blocks[i], first.selected_blocks[j]
            same_location = a.corridor_id == b.corridor_id and a.section == b.section
            if same_location:
                assert not _overlaps(a.start_time, a.end_time, b.start_time, b.end_time)


def test_goods_preference_selects_quieter_section():
    goods = sample_goods_forecast(
        forecast_id="FCST-2",
        date=NOW.date(),
        window_start=NOW.time(),
        window_end=(NOW + timedelta(hours=2)).time(),
        probability=0.78,
    )
    tasks = [
        sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=2)),
        sample_task(task_id="T2", window_start=NOW, window_end=NOW + timedelta(hours=2),
                    asset_id="AST-002", metadata={"section": "S2"}),
    ]
    context = make_planning_context(
        tasks=tasks, goods_forecasts=[goods],
        resources=[sample_resource(resource_id="RES-001")],
    )
    result = _optimizer(forecast_alignment=5.0).optimize(
        sample_block_request(request_id="REQ-4", task_ids=["T1", "T2"]), context
    )

    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == ["T2"]
    assert "T1" in result.unscheduled_task_ids
    t1_info = next(info for info in result.unscheduled_tasks if info.task_id == "T1")
    assert t1_info.rejection_codes == []