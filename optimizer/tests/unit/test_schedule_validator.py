"""Unit tests for the Phase 4 independent ScheduleValidator.

Covers the required responsibility list:

1. block time validity (start/end, declared duration, planning horizon);
2. task validity (existence, single assignment, coverage);
3. candidate/placement validity (engine-verified feasibility);
4. corridor conflicts (overlapping selected blocks on one section);
5. train conflicts (protected movements + configured safety buffer);
6. existing-block conflicts;
7. resource conflicts (capacity-1 double-booking);
8. location compatibility (task corridor/section vs block);
9. integrated-block validity (compatibility, sequential duration, no omission);
10. ConstraintEngine consistency (reused, not duplicated);
11. scheduled/unscheduled consistency.

Plus the independence doctrine: OPTIMAL/FEASIBLE status never implies VALID,
validation is deterministic, and no data is fabricated when optional context
data is absent.
"""

from datetime import timedelta

import pytest

from app.constraints import ConstraintEngine
from app.core.config import Settings
from app.services import ScheduleValidator as ScheduleValidatorInterface
from app.services.schedule_optimizer import ScheduleOptimizer
from app.services.schedule_validator import (
    DUPLICATE_TASK,
    NO_SOLUTION,
    SCHEDULE_INCONSISTENT,
    TASK_NOT_COVERED,
    UNKNOWN_TASK,
    ScheduleValidator,
)
from contracts import (
    ScheduleBlock,
    ScheduleResult,
    ScheduleValidationResult,
    TaskSchedulingInfo,
    ViolationSeverity,
)
from tests.helpers import (
    NOW,
    make_planning_context,
    sample_existing_block,
    sample_task,
    sample_train_movement,
)


# ----------------------------------------------------------------- builders


def make_block(
    block_id,
    task_ids,
    *,
    block_type="SINGLE",
    corridor_id="COR-1",
    section="S1",
    start=NOW,
    duration_minutes=120,
    declared_duration=None,
    **overrides,
) -> ScheduleBlock:
    end = start + timedelta(minutes=duration_minutes)
    values = dict(
        block_id=block_id,
        task_ids=list(task_ids),
        corridor_id=corridor_id,
        section=section,
        start_time=start,
        end_time=end,
        block_type=block_type,
        total_duration_minutes=(
            declared_duration if declared_duration is not None else duration_minutes
        ),
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


def validator(**settings) -> ScheduleValidator:
    return ScheduleValidator(settings=Settings(**settings))


def error_codes(result) -> set[str]:
    return {v.violation_code for v in result.errors}


def warning_codes(result) -> set[str]:
    return {v.violation_code for v in result.warnings}


def reasons(result) -> set[str]:
    return {v.reason for v in result.errors}


def one_task_context(task_overrides=None, **context_overrides) -> dict:
    defaults = dict(window_start=NOW, window_end=NOW + timedelta(hours=4))
    defaults.update(task_overrides or {})
    return make_planning_context(
        tasks=[sample_task(task_id="T1", **defaults)],
        **context_overrides,
    )


def integrated_context(durations=(60, 60)) -> dict:
    tasks = [
        sample_task(
            task_id=f"T{i}",
            estimated_duration_minutes=duration,
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        )
        for i, duration in zip((1, 2), durations)
    ]
    return make_planning_context(tasks=tasks)


# ------------------------------------------------------------ happy paths


def test_valid_hand_built_schedule_passes():
    schedule = make_result([make_block("BLK-1", ["T1"])])
    result = validator().validate(schedule, one_task_context())

    assert result.valid is True
    assert result.errors == []
    assert result.warnings == []
    assert isinstance(result, ScheduleValidationResult)


def test_validation_report_structure_and_counts():
    schedule = make_result([make_block("BLK-1", ["T1"])])
    result = validator().validate(schedule, one_task_context())

    assert result.schedule_id == "SCHED-TEST"
    assert result.solver_status == "OPTIMAL"
    assert result.checked_block_count == 1
    assert result.checked_task_count == 1
    assert result.valid is True
    assert "valid" in result.summary
    assert result.metadata["solver_status"] == "OPTIMAL"
    assert result.metadata["solver_status_had_solution"] is True
    assert result.metadata["deterministic"] is True
    assert "POWER_CONFLICT" in result.metadata["unsupported_constraints"]

    bridge = result.to_validation_report()
    assert bridge.valid is True
    assert bridge.errors == []
    assert bridge.summary == result.summary


def test_violation_records_carry_required_fields():
    schedule = make_result(
        [make_block("BLK-1", ["T1"])],
        scheduled=["T1"],
        unscheduled=["T1"],
        infos=[],
    )
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    for violation in result.errors:
        assert violation.severity == ViolationSeverity.ERROR
        assert violation.violation_code
        assert violation.reason
        assert isinstance(violation.affected_ids, list)
        assert violation.block_id is None or isinstance(violation.block_id, str)


# ------------------------------------------------------- corridor conflicts


def test_overlapping_same_corridor_blocks_rejected():
    context = one_task_context(task_overrides={"estimated_duration_minutes": 60})
    context["tasks"].append(
        sample_task(
            task_id="T2",
            asset_id="AST-002",
            metadata={"section": "S1"},
            estimated_duration_minutes=60,
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        )
    )
    schedule = make_result(
        [
            make_block("BLK-A", ["T1"], start=NOW, duration_minutes=60),
            make_block("BLK-B", ["T2"], start=NOW + timedelta(minutes=30), duration_minutes=60),
        ],
    )
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "CORRIDOR_CONFLICT" in error_codes(result)
    assert any("SAME_SECTION_OVERLAP" in r for r in reasons(result))


def test_overlapping_blocks_on_different_sections_are_allowed():
    context = one_task_context()
    context["tasks"].append(
        sample_task(
            task_id="T2",
            asset_id="AST-002",
            metadata={"section": "S2"},
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        )
    )
    schedule = make_result(
        [
            make_block("BLK-A", ["T1"], section="S1", duration_minutes=120),
            make_block("BLK-B", ["T2"], section="S2", duration_minutes=120),
        ],
    )
    result = validator().validate(schedule, context)

    assert result.valid is True
    assert "CORRIDOR_CONFLICT" not in error_codes(result)


# --------------------------------------------------------- train conflicts


def test_train_conflict_detected():
    context = one_task_context(train_movements=[sample_train_movement()])
    schedule = make_result([make_block("BLK-1", ["T1"])])
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "TRAIN_CONFLICT" in error_codes(result)


def test_train_conflict_respects_configured_safety_buffer():
    movement = sample_train_movement(
        departure=NOW + timedelta(hours=3),
        arrival=NOW + timedelta(hours=4),
    )
    context = one_task_context(
        task_overrides={"estimated_duration_minutes": 170},
        train_movements=[movement],
    )
    # ends at NOW+2h50: inside the 15-min buffer, outside a 5-min buffer
    block = make_block("BLK-1", ["T1"], start=NOW, duration_minutes=170)
    result = validator().validate(make_result([block]), context)
    assert "TRAIN_CONFLICT" in error_codes(result)
    assert result.valid is False

    relaxed = validator(safety_buffer_minutes=5).validate(make_result([block]), context)
    assert relaxed.valid is True


# --------------------------------------------------- existing-block conflicts


def test_existing_block_conflict_detected():
    context = one_task_context(existing_blocks=[sample_existing_block()])
    schedule = make_result([make_block("BLK-1", ["T1"])])
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "EXISTING_BLOCK_CONFLICT" in error_codes(result)


def test_completed_existing_block_does_not_conflict():
    from contracts import BlockStatus

    block = sample_existing_block()
    block = block.model_copy(update={"status": BlockStatus.COMPLETED})
    context = one_task_context(existing_blocks=[block])
    result = validator().validate(make_result([make_block("BLK-1", ["T1"])]), context)

    assert result.valid is True


# ------------------------------------------------------- resource conflicts


def _double_booked_context() -> dict:
    tasks = [
        sample_task(
            task_id="T1",
            required_resources=["RES-A"],
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        ),
        sample_task(
            task_id="T2",
            asset_id="AST-002",
            metadata={"section": "S2"},
            required_resources=["RES-A"],
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        ),
    ]
    from contracts import Resource

    return make_planning_context(
        tasks=tasks,
        resources=[Resource(resource_id="RES-A", resource_type="MACHINERY", name="Machine A", capacity=1)],
    )


def test_resource_double_booking_detected():
    schedule = make_result(
        [
            make_block("BLK-A", ["T1"], section="S1", duration_minutes=120),
            make_block("BLK-B", ["T2"], section="S2", duration_minutes=120),
        ],
    )
    result = validator().validate(schedule, _double_booked_context())

    assert result.valid is False
    assert "RESOURCE_CONFLICT" in error_codes(result)
    assert any("CAPACITY_ONE_DOUBLE_BOOKING" in r for r in reasons(result))


def test_shared_resource_with_capacity_above_one_is_not_flagged():
    from contracts import Resource

    context = _double_booked_context()
    context["resources"] = [
        Resource(resource_id="RES-A", resource_type="MACHINERY", name="Machine A", capacity=3)
    ]
    schedule = make_result(
        [
            make_block("BLK-A", ["T1"], section="S1", duration_minutes=120),
            make_block("BLK-B", ["T2"], section="S2", duration_minutes=120),
        ],
    )
    result = validator().validate(schedule, context)

    assert result.valid is True
    assert "RESOURCE_CONFLICT" not in error_codes(result)


def test_resource_outside_availability_window_detected():
    from contracts import Resource

    context = one_task_context(
        resources=[
            Resource(
                resource_id="MP-01",
                resource_type="MANPOWER",
                name="Gang",
                available_from=NOW + timedelta(hours=4),
                available_until=NOW + timedelta(hours=6),
            )
        ]
    )
    schedule = make_result([make_block("BLK-1", ["T1"])])
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "RESOURCE_CONFLICT" in error_codes(result)


# ----------------------------------------------------------- task validity


def test_duplicate_task_assignment_detected():
    context = one_task_context(task_overrides={"estimated_duration_minutes": 60})
    schedule = make_result(
        [
            make_block("BLK-A", ["T1"], start=NOW, duration_minutes=60),
            make_block("BLK-B", ["T1"], start=NOW + timedelta(minutes=60), duration_minutes=60),
        ]
    )
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert DUPLICATE_TASK in error_codes(result)
    assert any("DUPLICATE_TASK_ASSIGNMENT" in r for r in reasons(result))


def test_unknown_task_id_detected_in_blocks_and_lists():
    schedule = make_result(
        [make_block("BLK-1", ["GHOST"])],
        scheduled=["GHOST"],
    )
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert UNKNOWN_TASK in error_codes(result)


def test_scheduled_task_without_block_detected():
    schedule = make_result([make_block("BLK-1", ["T1"])], scheduled=["T1", "T2"])
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert TASK_NOT_COVERED in error_codes(result)
    assert any("SCHEDULED_TASK_WITHOUT_BLOCK" in r for r in reasons(result))


def test_block_task_missing_from_scheduled_ids_detected():
    schedule = make_result([make_block("BLK-1", ["T1"])], scheduled=[])
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert TASK_NOT_COVERED in error_codes(result)
    assert any("BLOCK_TASK_NOT_IN_SCHEDULED" in r for r in reasons(result))


# ------------------------------------------------------- block time validity


def test_invalid_block_duration_detected():
    # declared duration does not match the actual start/end span
    schedule = make_result([make_block("BLK-1", ["T1"], declared_duration=60)])
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert "DURATION_CONFLICT" in error_codes(result)
    assert any("DURATION_SPAN_MISMATCH" in r for r in reasons(result))


def test_single_block_duration_must_match_task_duration():
    # 90-minute block for a 120-minute task
    schedule = make_result([make_block("BLK-1", ["T1"], duration_minutes=90)])
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert "DURATION_CONFLICT" in error_codes(result)
    assert any("DURATION_NOT_TASK_DURATION" in r for r in reasons(result))


def test_block_outside_planning_horizon_detected():
    context = one_task_context()  # horizon: NOW .. NOW+7d
    schedule = make_result(
        [make_block("BLK-1", ["T1"], start=NOW + timedelta(days=8))]
    )
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "TIME_CONFLICT" in error_codes(result)
    assert any("HORIZON_END" in v.reason for v in result.errors)


def test_block_before_planning_horizon_detected():
    context = one_task_context()
    schedule = make_result(
        [make_block("BLK-1", ["T1"], start=NOW - timedelta(days=2))]
    )
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "TIME_CONFLICT" in error_codes(result)
    assert any("HORIZON_START" in v.reason for v in result.errors)


def test_task_window_violation_detected():
    context = one_task_context()  # T1 window: NOW .. NOW+4h
    schedule = make_result(
        [make_block("BLK-1", ["T1"], start=NOW + timedelta(hours=5), duration_minutes=60)]
    )
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "TIME_CONFLICT" in error_codes(result)
    assert any("TASK_WINDOW_VIOLATION" in r for r in reasons(result))


# ---------------------------------------------- location compatibility


def test_task_section_mismatch_detected():
    task = sample_task(
        task_id="T1",
        asset_id="AST-002",
        metadata={"section": "S2"},
        window_start=NOW,
        window_end=NOW + timedelta(hours=4),
    )
    context = make_planning_context(tasks=[task])
    schedule = make_result([make_block("BLK-1", ["T1"], section="S1")])
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "LOCATION_CONFLICT" in error_codes(result)
    assert any("TASK_SECTION_MISMATCH" in r for r in reasons(result))


def test_task_corridor_mismatch_detected_in_integrated_block():
    tasks = [
        sample_task(
            task_id="T1",
            estimated_duration_minutes=60,
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        ),
        sample_task(
            task_id="T2",
            corridor_id="COR-2",
            estimated_duration_minutes=60,
            metadata={"section": "S2"},
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        ),
    ]
    context = make_planning_context(
        tasks=tasks,
        corridors=[
            make_planning_context()["corridors"][0],
            make_planning_context()["corridors"][0].model_copy(
                update={"corridor_id": "COR-2", "sections": ["S2"]}
            ),
        ],
    )
    schedule = make_result(
        [make_block("IB-1", ["T1", "T2"], block_type="INTEGRATED", duration_minutes=120)]
    )
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert "CORRIDOR_CONFLICT" in error_codes(result)
    assert any("TASK_CORRIDOR_MISMATCH" in r for r in reasons(result))


# ------------------------------------------------------ integrated blocks


def test_integrated_block_missing_one_participating_task_detected():
    schedule = make_result(
        [make_block("IB-1", ["T1"], block_type="INTEGRATED", duration_minutes=60)],
        scheduled=["T1", "T2"],
    )
    result = validator().validate(schedule, integrated_context())

    assert result.valid is False
    assert TASK_NOT_COVERED in error_codes(result)
    assert any("SCHEDULED_TASK_WITHOUT_BLOCK" in r for r in reasons(result))


def test_integrated_block_with_insufficient_sequential_duration_detected():
    # two 60-minute participants but only a 60-minute window
    schedule = make_result(
        [make_block("IB-1", ["T1", "T2"], block_type="INTEGRATED", duration_minutes=60)]
    )
    result = validator().validate(schedule, integrated_context())

    assert result.valid is False
    assert "DURATION_CONFLICT" in error_codes(result)
    assert any("INTEGRATED_SEQUENTIAL_SHORTFALL" in r for r in reasons(result))


def test_integrated_block_with_matching_sequential_duration_passes():
    schedule = make_result(
        [make_block("IB-1", ["T1", "T2"], block_type="INTEGRATED", duration_minutes=120)]
    )
    result = validator().validate(schedule, integrated_context())

    assert result.valid is True
    assert result.errors == []


def test_single_block_cannot_cover_multiple_tasks():
    context = make_planning_context(
        tasks=[
            sample_task(task_id="T1", window_start=NOW, window_end=NOW + timedelta(hours=4)),
            sample_task(task_id="T2", asset_id="AST-002", metadata={"section": "S2"},
                        window_start=NOW, window_end=NOW + timedelta(hours=4)),
        ]
    )
    schedule = make_result([make_block("BLK-1", ["T1", "T2"], duration_minutes=120)])
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert SCHEDULE_INCONSISTENT in error_codes(result)
    assert any("SINGLE_BLOCK_MULTI_TASK" in r for r in reasons(result))


# --------------------------------------- scheduled/unscheduled consistency


def test_scheduled_unscheduled_overlap_detected():
    schedule = make_result(
        [make_block("BLK-1", ["T1"])],
        scheduled=["T1"],
        unscheduled=["T1"],
        infos=[TaskSchedulingInfo(task_id="T1", scheduled=False, reason="test")],
    )
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert SCHEDULE_INCONSISTENT in error_codes(result)
    assert any("SCHEDULED_UNSCHEDULED_OVERLAP" in r for r in reasons(result))


def test_duplicate_ids_within_scheduled_list_detected():
    schedule = make_result([make_block("BLK-1", ["T1"])], scheduled=["T1", "T1"])
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert DUPLICATE_TASK in error_codes(result)


def test_unscheduled_info_records_must_match_ids():
    schedule = make_result(
        [make_block("BLK-1", ["T1"])],
        scheduled=["T1"],
        unscheduled=["T2"],
        infos=[],  # records missing for T2
    )
    context = one_task_context()
    context["tasks"].append(
        sample_task(
            task_id="T2",
            asset_id="AST-002",
            status="UNSCHEDULED",
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        )
    )
    result = validator().validate(schedule, context)

    assert result.valid is False
    assert SCHEDULE_INCONSISTENT in error_codes(result)
    assert any("UNSCHEDULED_INFO_MISMATCH" in r for r in reasons(result))


def test_unscheduled_info_flagged_as_scheduled_is_inconsistent():
    schedule = make_result(
        [],
        scheduled=[],
        unscheduled=["T1"],
        infos=[TaskSchedulingInfo(task_id="T1", scheduled=True, reason="bad")],
    )
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert any("UNSCHEDULED_INFO_SCHEDULED_FLAG" in r for r in reasons(result))


# -------------------------------------------- status is never trusted


def test_optimal_status_does_not_make_corrupted_schedule_valid():
    context = one_task_context(train_movements=[sample_train_movement()])
    schedule = make_result([make_block("BLK-1", ["T1"])], status="OPTIMAL")
    result = validator().validate(schedule, context)

    assert schedule.status == "OPTIMAL"
    assert result.valid is False
    assert "TRAIN_CONFLICT" in error_codes(result)


def test_feasible_status_can_still_produce_a_valid_schedule():
    schedule = make_result([make_block("BLK-1", ["T1"])], status="FEASIBLE")
    result = validator().validate(schedule, one_task_context())

    assert schedule.status == "FEASIBLE"
    assert result.valid is True
    assert result.solver_status == "FEASIBLE"


def test_infeasible_with_no_usable_schedule_is_valid_with_warning():
    schedule = make_result(
        [],
        status="INFEASIBLE",
        scheduled=[],
        unscheduled=["T1"],
        infos=[TaskSchedulingInfo(task_id="T1", scheduled=False, reason="infeasible")],
    )
    result = validator().validate(schedule, one_task_context())

    assert result.valid is True
    assert result.errors == []
    assert NO_SOLUTION in warning_codes(result)
    assert result.metadata["solver_status_had_solution"] is False
    assert result.checked_block_count == 0


def test_non_solution_status_with_a_populated_schedule_is_rejected():
    schedule = make_result([make_block("BLK-1", ["T1"])], status="INFEASIBLE")
    result = validator().validate(schedule, one_task_context())

    assert result.valid is False
    assert SCHEDULE_INCONSISTENT in error_codes(result)
    assert any("STATUS_INFEASIBLE_WITH_SCHEDULE" in r for r in reasons(result))


# ------------------------------------------- honest absence / no fabrication


def test_missing_optional_data_creates_no_fabricated_conflicts():
    task = sample_task(task_id="T1")  # no window, no resources in catalogue
    sparse = make_planning_context(
        tasks=[task],
        corridors=[],
        existing_blocks=[],
        train_movements=[],
        goods_forecasts=[],
        resources=[],
        assets=[],
        horizon_start=None,
        horizon_end=None,
    )
    schedule = make_result([make_block("BLK-1", ["T1"])])
    result = validator().validate(schedule, sparse)

    assert result.valid is True
    assert result.errors == []
    assert result.warnings == []


def test_supported_and_unsupported_codes_are_documented():
    v = validator()
    assert "POWER_CONFLICT" in v.unsupported_constraints
    assert "DEPENDENCY_CONFLICT" in v.unsupported_constraints
    assert v.unsupported_constraints == {
        "POWER_CONFLICT": "contracts contain no power-isolation / feed-section requirement fields",
        "DEPENDENCY_CONFLICT": "MaintenanceTask has no prerequisite / dependency fields",
    }
    for code in ("POWER_CONFLICT", "DEPENDENCY_CONFLICT"):
        assert code in v.unsupported_constraints
        assert code not in v.supported_codes


def test_power_and_dependency_conflicts_never_emitted():
    context = one_task_context(
        train_movements=[sample_train_movement()],
        existing_blocks=[sample_existing_block()],
    )
    schedule = make_result([make_block("BLK-1", ["T1"])])
    result = validator().validate(schedule, context)

    emitted = {v.violation_code for v in result.errors + result.warnings}
    assert "POWER_CONFLICT" not in emitted
    assert "DEPENDENCY_CONFLICT" not in emitted
    assert emitted <= validator().supported_codes


# --------------------------------------------------- independence & reuse


def _counting_engine(**overrides) -> ConstraintEngine:
    class _Counting(ConstraintEngine):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.calls = 0

        def validate(self, candidate, context):
            self.calls += 1
            return super().validate(candidate, context)

    return _Counting(settings=Settings(**overrides))


def test_constraint_engine_is_reused_per_block():
    engine = _counting_engine()
    v = ScheduleValidator(settings=Settings(), constraint_engine=engine)

    single = v.validate(make_result([make_block("BLK-1", ["T1"])]), one_task_context())
    assert single.valid is True
    assert engine.calls == 1  # one placement re-checked per block

    engine.calls = 0
    integrated = v.validate(
        make_result([make_block("IB-1", ["T1", "T2"], block_type="INTEGRATED",
                                duration_minutes=120)]),
        integrated_context(),
    )
    assert integrated.valid is True
    assert engine.calls == 3  # combined placement + each participant placement


def test_validator_never_calls_schedule_optimizer(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("ScheduleValidator must not invoke the optimizer")

    monkeypatch.setattr(ScheduleOptimizer, "optimize", boom)
    schedule = make_result([make_block("BLK-1", ["T1"])])
    result = validator().validate(schedule, one_task_context())

    assert result.valid is True


def test_validation_is_deterministic():
    context = one_task_context(task_overrides={"estimated_duration_minutes": 60})
    context["tasks"].append(
        sample_task(
            task_id="T2",
            asset_id="AST-002",
            metadata={"section": "S2"},
            estimated_duration_minutes=60,
            window_start=NOW,
            window_end=NOW + timedelta(hours=4),
        )
    )
    schedule = make_result(
        [
            make_block("BLK-A", ["T1"], section="S1", duration_minutes=60),
            make_block("BLK-B", ["T2"], section="S2",
                       start=NOW + timedelta(minutes=60), duration_minutes=60),
        ],
        scheduled=["T1", "T2"],
    )
    first = validator().validate(schedule, context)
    second = validator().validate(schedule, context)

    assert first.valid is True
    assert first.model_dump(mode="json") == second.model_dump(mode="json")


def test_violations_are_ordered_deterministically():
    context = one_task_context(train_movements=[sample_train_movement()],
                               existing_blocks=[sample_existing_block()])
    # corrupt several dimensions at once and assert stable ordering
    schedule = make_result(
        [make_block("BLK-1", ["T1"], declared_duration=60)],
        scheduled=["T1", "T1"],
    )
    first = validator().validate(schedule, context)
    second = validator().validate(schedule, context)

    assert first.errors  # something was caught
    assert [v.violation_code for v in first.errors] == [
        v.violation_code for v in second.errors
    ]
    assert first.model_dump(mode="json") == second.model_dump(mode="json")


def test_concrete_validator_satisfies_interface():
    assert issubclass(ScheduleValidator, ScheduleValidatorInterface)
    assert not getattr(ScheduleValidator, "__abstractmethods__", None)
