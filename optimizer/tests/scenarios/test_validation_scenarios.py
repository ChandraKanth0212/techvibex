"""Phase 4 scenario tests: real ScheduleOptimizer output -> ScheduleValidator.

Each scenario runs the true scheduling pipeline and then asks the independent
validator to adjudicate the finished schedule:

- the optimizer's OPTIMAL output (single and integrated) is adjudged VALID;
- a world with no feasible solution produces an empty schedule the validator
  considers VALID (with an explicit NO_SOLUTION warning) - an empty result is
  not a fake schedule;
- a tampered OPTIMAL result (declared duration changed after the solve) is
  REJECTED: solver status never implies validity.
"""

from datetime import timedelta

from app.core.config import ObjectiveWeights, Settings
from app.services.schedule_optimizer import ScheduleOptimizer
from app.services.schedule_validator import NO_SOLUTION, ScheduleValidator
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


def _validator() -> ScheduleValidator:
    return ScheduleValidator(settings=Settings())


def test_optimizer_output_for_single_block_is_adjudged_valid():
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
    assert len(result.selected_blocks) == 1

    validation = _validator().validate(result, context)

    assert validation.valid is True
    assert validation.errors == []
    assert validation.warnings == []
    assert validation.checked_block_count == 1
    assert validation.solver_status == "OPTIMAL"


def test_optimizer_output_for_integrated_block_is_adjudged_valid():
    tasks = [
        sample_task(task_id="T1", estimated_duration_minutes=60,
                    window_start=NOW + timedelta(hours=3), window_end=NOW + timedelta(hours=7)),
        sample_task(task_id="T2", estimated_duration_minutes=60,
                    window_start=NOW + timedelta(hours=3), window_end=NOW + timedelta(hours=7)),
        sample_task(task_id="T3", window_start=NOW, window_end=NOW + timedelta(hours=3)),
    ]
    train = sample_train_movement(
        movement_id="MOV-1", train_number="11007",
        departure=NOW, arrival=NOW + timedelta(hours=2),
    )
    context = make_planning_context(tasks=tasks, train_movements=[train])
    result = _optimizer(slot_consolidation=2.0).optimize(
        sample_block_request(request_id="REQ-2", task_ids=["T1", "T2", "T3"]), context
    )

    assert result.status == "OPTIMAL"
    assert len(result.selected_blocks) == 1
    assert result.selected_blocks[0].block_type == "INTEGRATED"

    validation = _validator().validate(result, context)

    assert validation.valid is True
    assert validation.errors == []
    assert validation.checked_block_count == 1
    assert validation.checked_task_count == 3


def test_infeasible_world_empty_schedule_is_valid_with_no_solution_warning():
    # the only task window sits entirely inside the protected train envelope
    train = sample_train_movement(
        movement_id="MOV-2", train_number="11008",
        departure=NOW - timedelta(hours=1), arrival=NOW + timedelta(hours=5),
    )
    tasks = [
        sample_task(
            task_id="T1",
            window_start=NOW,
            window_end=NOW + timedelta(hours=3),
        )
    ]
    context = make_planning_context(tasks=tasks, train_movements=[train])
    result = _optimizer().optimize(
        sample_block_request(request_id="REQ-3", task_ids=["T1"]), context
    )

    assert result.status in ("INFEASIBLE", "UNKNOWN")  # no schedulable placement
    assert result.selected_blocks == []

    validation = _validator().validate(result, context)

    assert validation.valid is True
    assert validation.errors == []
    assert NO_SOLUTION in {v.violation_code for v in validation.warnings}
    assert validation.metadata["solver_status_had_solution"] is False
    assert validation.checked_block_count == 0


def test_tampered_optimal_output_is_rejected():
    tasks = [
        sample_task(
            task_id="T1",
            window_start=NOW,
            window_end=NOW + timedelta(hours=3),
        )
    ]
    context = make_planning_context(tasks=tasks)
    result = _optimizer().optimize(
        sample_block_request(request_id="REQ-4", task_ids=["T1"]), context
    )

    assert result.status == "OPTIMAL"

    # tamper with the "optimal" result after the solve
    block = result.selected_blocks[0]
    tampered_block = block.model_copy(update={"total_duration_minutes": 30})
    tampered = result.model_copy(update={"selected_blocks": [tampered_block]})

    validation = _validator().validate(tampered, context)

    assert tampered.status == "OPTIMAL"
    assert validation.valid is False
    assert any("DURATION_SPAN_MISMATCH" in v.reason for v in validation.errors)