"""Phase 5 scenario tests: ScheduleOptimizer -> ScheduleValidator -> Metrics.

Each scenario runs the real pipeline and asserts the KPI layer agrees with the
independently validated truth:

- a fully covered schedule reports 100% coverage, no urgent drops and 100%
  validation accuracy;
- an integrated schedule reports consolidation > 1.0;
- a tampered OPTIMAL result is rejected by the validator and the accuracy score
  is penalised accordingly;
- an URGENT task the world genuinely blocks is surfaced as an urgent drop and its
  hard conflict is counted as resolved (honoured, not violated).
"""

from datetime import timedelta

from app.core.config import ObjectiveWeights, Settings
from app.services.metrics_calculator import MetricsCalculator
from app.services.schedule_optimizer import ScheduleOptimizer
from app.services.schedule_validator import ScheduleValidator
from contracts import PriorityLevel
from tests.helpers import (
    NOW,
    make_planning_context,
    sample_block_request,
    sample_task,
    sample_train_movement,
)


def _optimizer(**weight_overrides) -> ScheduleOptimizer:
    weights = ObjectiveWeights(**weight_overrides)
    return ScheduleOptimizer(settings=Settings(objective_weights=weights))


def test_fully_covered_schedule_metrics_agree_with_validation():
    tasks = [
        sample_task(
            task_id="T1",
            window_start=NOW,
            window_end=NOW + timedelta(hours=3),
        )
    ]
    context = make_planning_context(tasks=tasks)
    result = _optimizer().optimize(
        sample_block_request(request_id="REQ-1", task_ids=["T1"]), context
    )

    assert result.status == "OPTIMAL"
    validation = ScheduleValidator(settings=Settings()).validate(result, context)
    metrics = MetricsCalculator(settings=Settings()).compute(result, context, validation)

    assert validation.valid is True
    assert metrics.task_coverage_ratio == 1.0
    assert metrics.total_tasks_scheduled == 1
    assert metrics.integrated_blocks_count == 0
    assert metrics.block_consolidation_ratio == 1.0
    assert metrics.unscheduled_urgent_tasks == 0
    assert metrics.validation_accuracy_percent == 100.0


def test_integrated_schedule_reports_consolidation():
    tasks = [
        sample_task(task_id="T1", estimated_duration_minutes=60,
                    window_start=NOW, window_end=NOW + timedelta(hours=4)),
        sample_task(task_id="T2", estimated_duration_minutes=60,
                    window_start=NOW, window_end=NOW + timedelta(hours=4)),
        sample_task(task_id="T3", estimated_duration_minutes=60,
                    window_start=NOW, window_end=NOW + timedelta(hours=4)),
    ]
    context = make_planning_context(tasks=tasks)
    result = _optimizer(slot_consolidation=2.0).optimize(
        sample_block_request(request_id="REQ-2", task_ids=["T1", "T2", "T3"]), context
    )

    assert result.status == "OPTIMAL"
    assert len(result.selected_blocks) == 1
    assert result.selected_blocks[0].block_type == "INTEGRATED"

    validation = ScheduleValidator(settings=Settings()).validate(result, context)
    metrics = MetricsCalculator(settings=Settings()).compute(result, context, validation)

    assert validation.valid is True
    assert metrics.integrated_blocks_count == 1
    assert metrics.block_consolidation_ratio == 3.0
    assert metrics.task_coverage_ratio == 1.0
    assert metrics.validation_accuracy_percent == 100.0


def test_tampered_optimal_schedule_is_penalised_in_metrics():
    tasks = [
        sample_task(
            task_id="T1",
            window_start=NOW,
            window_end=NOW + timedelta(hours=3),
        )
    ]
    context = make_planning_context(tasks=tasks)
    result = _optimizer().optimize(
        sample_block_request(request_id="REQ-3", task_ids=["T1"]), context
    )

    assert result.status == "OPTIMAL"

    block = result.selected_blocks[0]
    tampered_block = block.model_copy(update={"total_duration_minutes": 30})
    tampered = result.model_copy(update={"selected_blocks": [tampered_block]})

    validation = ScheduleValidator(settings=Settings()).validate(tampered, context)
    metrics = MetricsCalculator(settings=Settings()).compute(tampered, context, validation)

    assert validation.valid is False
    assert metrics.validation_accuracy_percent == 0.0
    assert metrics.extra["validation"]["error_count"] >= 1


def test_urgent_drop_and_honoured_conflict_surface_in_metrics():
    train = sample_train_movement(
        movement_id="MOV-1",
        train_number="11007",
        departure=NOW + timedelta(hours=3),
        arrival=NOW + timedelta(hours=5),
    )
    tasks = [
        sample_task(task_id="T1", estimated_duration_minutes=60,
                    window_start=NOW, window_end=NOW + timedelta(hours=2)),
        sample_task(task_id="T2", priority=PriorityLevel.URGENT,
                    estimated_duration_minutes=60,
                    window_start=NOW + timedelta(hours=3),
                    window_end=NOW + timedelta(hours=5)),
    ]
    context = make_planning_context(tasks=tasks, train_movements=[train])
    result = _optimizer().optimize(
        sample_block_request(request_id="REQ-4", task_ids=["T1", "T2"]), context
    )

    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == ["T1"]
    assert result.unscheduled_task_ids == ["T2"]

    validation = ScheduleValidator(settings=Settings()).validate(result, context)
    metrics = MetricsCalculator(settings=Settings()).compute(result, context, validation)

    assert validation.valid is True
    assert metrics.task_coverage_ratio == 0.5
    assert metrics.scheduled_urgent_tasks == 0
    assert metrics.unscheduled_urgent_tasks == 1
    assert metrics.conflicts_resolved == 1
    assert metrics.extra["rejection_code_counts"].get("TRAIN_CONFLICT") == 1
    assert metrics.validation_accuracy_percent == 100.0