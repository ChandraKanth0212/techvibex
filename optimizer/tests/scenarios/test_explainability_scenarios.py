"""Phase 6 scenario tests: the full verification pipeline.

ScheduleOptimizer -> ScheduleValidator -> MetricsCalculator ->
ExplainabilityService, asserting that the explanations derived from the real
pipeline stay honest and agree with the independently validated truth:

- a fully covered OPTIMAL schedule is explained as scheduled, with independent
  validation recorded on the same record and the coverage KPI echoed into the
  METRIC record;
- an integrated schedule produces an INTEGRATED_BLOCK explanation listing every
  participant, with the same maths the optimizer applied to the shared window;
- a task the world genuinely blocks (TRAIN_CONFLICT) is explained as unscheduled
  with the engine conflict code and the urgent drop echoed by the KPI layer;
- the whole pipeline is deterministic end-to-end.
"""

from datetime import timedelta

from app.core.config import ObjectiveWeights, Settings
from app.services.explainability import ExplainabilityService
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


def _pipeline(context, request, **weight_overrides):
    weights = ObjectiveWeights(**weight_overrides)
    settings = Settings(objective_weights=weights)
    result = ScheduleOptimizer(settings=settings).optimize(request, context)
    validation = ScheduleValidator(settings=settings).validate(result, context)
    metrics = MetricsCalculator(settings=settings).compute(result, context, validation)
    explanation = ExplainabilityService(settings=settings).explain(
        result, context, validation=validation, metrics=metrics,
    )
    return result, validation, metrics, explanation


def _record(explanations, subject_type, subject_id):
    for record in explanations.records:
        if record.subject_type == subject_type and record.subject_id == subject_id:
            return record
    raise AssertionError(
        f"no {subject_type} record for {subject_id} in "
        f"{[(r.subject_type, r.subject_id) for r in explanations.records]}"
    )


def test_fully_covered_optimal_schedule_is_explained_honestly():
    context = make_planning_context(tasks=[
        sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=3)),
    ])
    result, validation, metrics, explanation = _pipeline(
        context, sample_block_request(request_id="REQ-1", task_ids=["T1"]),
    )

    assert result.status == "OPTIMAL"
    assert validation.valid is True

    schedule = _record(explanation, "SCHEDULE", result.schedule_id)
    assert schedule.status == "OPTIMAL"
    assert schedule.evidence["validation"]["provided"] is True
    assert schedule.evidence["validation"]["valid"] is True
    assert "not claimed" not in schedule.summary
    assert explanation.schedule_valid is True
    assert explanation.validation_provided is True

    task_record = _record(explanation, "SCHEDULED_TASK", "T1")
    assert task_record.status == "SCHEDULED"
    assert "SCHEDULED" in task_record.reason_codes
    assert task_record.evidence["block_id"] in {b.block_id for b in result.selected_blocks}
    assert task_record.evidence["solver_status"] == "OPTIMAL"

    metric_record = _record(explanation, "METRIC", result.schedule_id)
    assert metric_record.evidence["task_coverage_ratio"] == metrics.task_coverage_ratio == 1.0
    assert metric_record.evidence["validation_accuracy_percent"] == 100.0

    # records agree with the validated truth everywhere
    assert all(r.status in ("METRIC",) or r.evidence["solver_status"] == "OPTIMAL"
               for r in explanation.records if "solver_status" in r.evidence)


def test_integrated_schedule_explanation_matches_optimizer_math():
    tasks = [
        sample_task(task_id="T1", estimated_duration_minutes=60,
                    window_start=NOW, window_end=NOW + timedelta(hours=4)),
        sample_task(task_id="T2", estimated_duration_minutes=60,
                    window_start=NOW, window_end=NOW + timedelta(hours=4)),
    ]
    context = make_planning_context(tasks=tasks)
    result, validation, metrics, explanation = _pipeline(
        context,
        sample_block_request(request_id="REQ-2", task_ids=["T1", "T2"]),
        slot_consolidation=2.0,
    )

    assert result.status == "OPTIMAL"
    assert len(result.selected_blocks) == 1
    block = result.selected_blocks[0]
    assert block.block_type == "INTEGRATED"

    block_record = _record(explanation, "INTEGRATED_BLOCK", block.block_id)
    assert block_record.status == "SCHEDULED"
    assert block_record.evidence["task_ids"] == ["T1", "T2"]
    assert block_record.evidence["participant_count"] == 2
    assert block_record.evidence["shared_possession_minutes"] == block.total_duration_minutes
    assert block_record.evidence["shared_window_covers_sequential"] is True

    for participant in ("T1", "T2"):
        task_record = _record(explanation, "SCHEDULED_TASK", participant)
        assert "INTEGRATED_BLOCK" in task_record.reason_codes
        assert task_record.evidence["block_id"] == block.block_id

    metric_record = _record(explanation, "METRIC", result.schedule_id)
    assert metric_record.evidence["integrated_blocks_count"] == metrics.integrated_blocks_count == 1
    assert metric_record.evidence["average_possession_minutes"] == block.total_duration_minutes


def test_genuinely_blocked_urgent_task_is_explained_with_conflict():
    train = sample_train_movement(
        movement_id="MOV-1",
        train_number="11007",
        departure=NOW + timedelta(hours=3),
        arrival=NOW + timedelta(hours=5),
    )
    context = make_planning_context(
        tasks=[
            sample_task(task_id="T1", estimated_duration_minutes=60,
                        window_start=NOW, window_end=NOW + timedelta(hours=2)),
            sample_task(task_id="T2", priority=PriorityLevel.URGENT,
                        estimated_duration_minutes=60,
                        window_start=NOW + timedelta(hours=3),
                        window_end=NOW + timedelta(hours=5)),
        ],
        train_movements=[train],
    )
    result, validation, metrics, explanation = _pipeline(
        context, sample_block_request(request_id="REQ-3", task_ids=["T1", "T2"]),
    )

    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == ["T1"]
    assert result.unscheduled_task_ids == ["T2"]
    assert validation.valid is True

    unscheduled = _record(explanation, "UNSCHEDULED_TASK", "T2")
    assert unscheduled.status == "UNSCHEDULED"
    assert "UNSCHEDULED" in unscheduled.reason_codes
    rejection_codes = unscheduled.evidence["rejection_codes"]
    assert rejection_codes, "optimizer must record a rejection code for the blocked task"
    assert "TRAIN_CONFLICT" in rejection_codes
    assert "TRAIN_CONFLICT" in unscheduled.reason_codes
    assert unscheduled.evidence["solver_status"] == "OPTIMAL"

    # NO_FEASIBLE_CANDIDATE, if claimed, is strictly limited to the examined set
    if "NO_FEASIBLE_CANDIDATE" in unscheduled.reason_codes:
        assert "examined" in unscheduled.summary

    metric_record = _record(explanation, "METRIC", result.schedule_id)
    assert metric_record.evidence["unscheduled_urgent_tasks"] == 1
    assert metric_record.evidence["task_coverage_ratio"] == 0.5


def test_pipeline_explanation_is_deterministic_end_to_end():
    train = sample_train_movement(
        movement_id="MOV-1",
        train_number="11007",
        departure=NOW + timedelta(hours=3),
        arrival=NOW + timedelta(hours=5),
    )
    context = make_planning_context(
        tasks=[
            sample_task(task_id="T1", estimated_duration_minutes=60,
                        window_start=NOW, window_end=NOW + timedelta(hours=2)),
            sample_task(task_id="T2", priority=PriorityLevel.URGENT,
                        estimated_duration_minutes=60,
                        window_start=NOW + timedelta(hours=3),
                        window_end=NOW + timedelta(hours=5)),
        ],
        train_movements=[train],
    )
    request = sample_block_request(request_id="REQ-4", task_ids=["T1", "T2"])
    runs = [_pipeline(context, request) for _ in range(2)]
    first = runs[0][3]
    second = runs[1][3]

    assert first.model_dump() == second.model_dump()
    assert first.summary_text() == second.summary_text()
    for record in first.records:
        assert record.reason_codes == sorted(record.reason_codes)