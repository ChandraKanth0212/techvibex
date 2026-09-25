"""Unit tests for the Phase 5 MetricsCalculator.

Covers the responsibility list:

1. coverage (task_coverage_ratio, partial schedules, empty scopes);
2. possession aggregates (average, slot utilisation against the horizon);
3. block consolidation (per-block task density, integrated counting);
4. resource utilisation (task-minutes vs possession minutes);
5. urgent-task drops (scheduled vs unscheduled URGENT counts);
6. conflicts resolved (rejection codes honoured on unscheduled tasks);
7. validation accuracy (formula, nothing fabricated when omitted);
8. determinism and interface satisfaction.

Plus honesty doctrine: accuracy stays ``None`` when no independent
validation result is supplied, and every figure is derived from the result +
context, never from the solver's claims.
"""

from datetime import timedelta

from app.core.config import Settings
from app.services import MetricsCalculator as MetricsCalculatorInterface
from app.services.metrics_calculator import MetricsCalculator
from app.services.schedule_validator import ScheduleValidator
from contracts import (
    ScheduleBlock,
    ScheduleMetrics,
    ScheduleResult,
    ScheduleValidationResult,
    TaskSchedulingInfo,
)
from tests.helpers import (
    NOW,
    make_planning_context,
    sample_task,
)


# ----------------------------------------------------------------- builders


def make_block(
    block_id,
    task_ids,
    *,
    block_type="SINGLE",
    start=NOW,
    duration_minutes=120,
    **overrides,
) -> ScheduleBlock:
    values = dict(
        block_id=block_id,
        task_ids=list(task_ids),
        corridor_id="COR-1",
        section="S1",
        start_time=start,
        end_time=start + timedelta(minutes=duration_minutes),
        block_type=block_type,
        total_duration_minutes=duration_minutes,
    )
    values.update(overrides)
    return ScheduleBlock(**values)


def make_result(
    blocks,
    *,
    status="OPTIMAL",
    schedule_id="SCHED-TEST",
    scheduled=None,
    unscheduled=None,
    infos=None,
) -> ScheduleResult:
    if scheduled is None:
        scheduled = sorted({tid for block in blocks for tid in block.task_ids})
    if unscheduled is None:
        unscheduled = []
    if infos is None:
        infos = [
            TaskSchedulingInfo(task_id=tid, scheduled=False, reason="test")
            for tid in sorted(unscheduled)
        ]
    return ScheduleResult(
        schedule_id=schedule_id,
        status=status,
        selected_blocks=list(blocks),
        scheduled_task_ids=list(scheduled),
        unscheduled_task_ids=list(unscheduled),
        unscheduled_tasks=list(infos),
    )


def calculator() -> MetricsCalculator:
    return MetricsCalculator(settings=Settings())


def task_context(tasks) -> dict:
    return make_planning_context(tasks=tasks)


def one_task(**overrides):
    defaults = dict(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=4))
    defaults.update(overrides)
    return sample_task(**defaults)


# ---------------------------------------------------------------- happy paths


def test_full_coverage_single_block():
    context = task_context([one_task()])
    metrics = calculator().compute(make_result([make_block("BLK-1", ["T1"])]), context)

    assert metrics.total_tasks_requested == 1
    assert metrics.total_tasks_scheduled == 1
    assert metrics.task_coverage_ratio == 1.0
    assert metrics.integrated_blocks_count == 0
    assert metrics.block_consolidation_ratio == 1.0
    assert metrics.average_possession_minutes == 120.0
    assert isinstance(metrics, ScheduleMetrics)


def test_partial_coverage_reflected():
    context = task_context([one_task(), one_task(task_id="T2", asset_id="AST-002")])
    schedule = make_result(
        [make_block("BLK-1", ["T1"])],
        scheduled=["T1"],
        unscheduled=["T2"],
        infos=[TaskSchedulingInfo(task_id="T2", scheduled=False, reason="conflict")],
    )
    metrics = calculator().compute(schedule, context)

    assert metrics.total_tasks_requested == 2
    assert metrics.total_tasks_scheduled == 1
    assert metrics.task_coverage_ratio == 0.5


def test_empty_schedule_zeroes():
    context = task_context([one_task()])
    schedule = make_result([], status="INFEASIBLE", scheduled=[], unscheduled=["T1"])
    metrics = calculator().compute(schedule, context)

    assert metrics.total_tasks_requested == 1
    assert metrics.total_tasks_scheduled == 0
    assert metrics.task_coverage_ratio == 0.0
    assert metrics.block_consolidation_ratio == 0.0
    assert metrics.average_possession_minutes == 0.0
    assert metrics.slot_utilisation_percent == 0.0
    assert metrics.resource_utilisation_percent == 0.0


def test_integrated_block_consolidation():
    context = task_context([one_task(), one_task(task_id="T2", asset_id="AST-002")])
    schedule = make_result([make_block("IB-1", ["T1", "T2"], block_type="INTEGRATED")])
    metrics = calculator().compute(schedule, context)

    assert metrics.integrated_blocks_count == 1
    assert metrics.block_consolidation_ratio == 2.0
    assert metrics.total_tasks_requested == 2
    assert metrics.task_coverage_ratio == 1.0


def test_slot_utilisation_against_horizon():
    context = task_context([one_task()])
    schedule = make_result([make_block("BLK-1", ["T1"], duration_minutes=60)])
    metrics = calculator().compute(schedule, context)

    # horizon is the default NOW .. NOW+7d
    assert metrics.slot_utilisation_percent > 0.0
    assert metrics.slot_utilisation_percent < 1.0


def test_resource_utilisation_from_task_minutes():
    # 60-minute task wedged inside a 120-minute block -> 50% utilisation
    context = task_context([one_task(estimated_duration_minutes=60)])
    schedule = make_result([make_block("BLK-1", ["T1"], duration_minutes=120)])
    metrics = calculator().compute(schedule, context)

    assert metrics.resource_utilisation_percent == 50.0


def test_unknown_tasks_lower_resource_utilisation():
    # block references a task absent from context -> 0 task-minutes
    context = task_context([one_task(estimated_duration_minutes=60)])
    schedule = make_result(
        [make_block("BLK-1", ["GHOST"], duration_minutes=120)],
        scheduled=["GHOST"],
    )
    metrics = calculator().compute(schedule, context)

    assert metrics.resource_utilisation_percent == 0.0


def test_urgent_task_drop_counted():
    context = task_context(
        [one_task(), one_task(task_id="T2", asset_id="AST-002")]
    )
    from contracts import PriorityLevel

    context["tasks"][1] = context["tasks"][1].model_copy(update={"priority": PriorityLevel.URGENT})
    schedule = make_result(
        [make_block("BLK-1", ["T1"])],
        scheduled=["T1"],
        unscheduled=["T2"],
        infos=[TaskSchedulingInfo(task_id="T2", scheduled=False, reason="blocked")],
    )
    metrics = calculator().compute(schedule, context)

    assert metrics.scheduled_urgent_tasks == 0
    assert metrics.unscheduled_urgent_tasks == 1


def test_conflicts_resolved_counts_rejection_codes():
    infos = [
        TaskSchedulingInfo(
            task_id="T2",
            scheduled=False,
            reason="blocked",
            rejection_codes=["TRAIN_CONFLICT", "EXISTING_BLOCK_CONFLICT"],
        ),
        TaskSchedulingInfo(task_id="T3", scheduled=False, reason="not selected"),
    ]
    schedule = make_result(
        [make_block("BLK-1", ["T1"])],
        scheduled=["T1"],
        unscheduled=["T2", "T3"],
        infos=infos,
    )
    context = task_context(
        [one_task(), one_task(task_id="T2", asset_id="AST-002"), one_task(task_id="T3", asset_id="AST-003")]
    )
    metrics = calculator().compute(schedule, context)

    assert metrics.conflicts_resolved == 2
    assert metrics.extra["rejection_code_counts"] == {
        "EXISTING_BLOCK_CONFLICT": 1,
        "TRAIN_CONFLICT": 1,
    }


# ------------------------------------------------------- validation accuracy


def _validated(schedule, context, *validators):
    return validators[0].validate(schedule, context)


def test_accuracy_is_none_without_validation_result():
    context = task_context([one_task()])
    metrics = calculator().compute(make_result([make_block("BLK-1", ["T1"])]), context)

    assert metrics.validation_accuracy_percent is None
    assert metrics.extra["validation"]["provided"] is False


def test_accuracy_is_100_when_independent_validation_has_no_errors():
    context = task_context([one_task()])
    schedule = make_result([make_block("BLK-1", ["T1"])])
    validation = ScheduleValidator(settings=Settings()).validate(schedule, context)
    metrics = calculator().compute(schedule, context, validation)

    assert validation.valid is True
    assert metrics.validation_accuracy_percent == 100.0


def test_accuracy_penalised_by_validation_errors():
    context = task_context([one_task()])
    # declared duration (60) does not match the 120-minute block span
    schedule = make_result([make_block("BLK-1", ["T1"], total_duration_minutes=60)])
    validation = ScheduleValidator(settings=Settings()).validate(schedule, context)

    assert validation.valid is False
    assert len(validation.errors) == 1
    metrics = calculator().compute(schedule, context, validation)

    # 1 error against 1 checked task -> 0% accuracy
    assert metrics.validation_accuracy_percent == 0.0


def test_accuracy_scales_with_checked_content():
    # one validation error against four checked tasks withdraws a quarter
    context = task_context([one_task()])
    schedule = make_result([make_block("BLK-1", ["T1"], total_duration_minutes=60)])
    v = ScheduleValidator(settings=Settings()).validate(schedule, context)
    validation = ScheduleValidationResult(
        schedule_id="SCHED-TEST",
        solver_status="OPTIMAL",
        valid=False,
        errors=list(v.errors),
        checked_block_count=1,
        checked_task_count=4,
    )
    metrics = calculator().compute(schedule, context, validation)

    assert validation.errors  # still reported as invalid
    assert metrics.validation_accuracy_percent == 75.0


def test_accuracy_accepts_validation_as_dict():
    context = task_context([one_task()])
    schedule = make_result([make_block("BLK-1", ["T1"])])
    validation = ScheduleValidator(settings=Settings()).validate(schedule, context)
    metrics = calculator().compute(schedule, context, validation.model_dump())

    assert metrics.validation_accuracy_percent == 100.0


# ---------------------------------------------- determinism / interface


def test_compute_is_deterministic():
    context = task_context(
        [one_task(), one_task(task_id="T2", asset_id="AST-002")]
    )
    schedule = make_result(
        [make_block("IB-1", ["T1", "T2"], block_type="INTEGRATED")],
        scheduled=["T1", "T2"],
        unscheduled=[],
    )
    first = calculator().compute(schedule, context)
    second = calculator().compute(schedule, context)

    assert first.model_dump(mode="json") == second.model_dump(mode="json")


def test_concrete_calculator_satisfies_interface():
    assert issubclass(MetricsCalculator, MetricsCalculatorInterface)
    assert not getattr(MetricsCalculator, "__abstractmethods__", None)


def test_metrics_result_round_trips_through_pydantic():
    context = task_context([one_task()])
    metrics = calculator().compute(make_result([make_block("BLK-1", ["T1"])]), context)
    dumped = metrics.model_dump(mode="json")
    restored = ScheduleMetrics.model_validate(dumped)

    assert restored == metrics


def test_full_pipeline_metrics_agree_with_validator():
    context = task_context(
        [one_task(), one_task(task_id="T2", asset_id="AST-002")]
    )
    schedule = make_result(
        [make_block("BLK-1", ["T1"])],
        scheduled=["T1"],
        unscheduled=["T2"],
        infos=[
            TaskSchedulingInfo(
                task_id="T2",
                scheduled=False,
                reason="conflict",
                rejection_codes=["TRAIN_CONFLICT"],
            )
        ],
    )
    validation = ScheduleValidator(settings=Settings()).validate(schedule, context)
    metrics = calculator().compute(schedule, context, validation)

    assert metrics.extra["validation"]["valid"] == validation.valid
    assert metrics.extra["validation"]["error_count"] == len(validation.errors)
    assert metrics.conflicts_resolved == 1