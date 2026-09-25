"""Unit tests for the Phase 2 ConstraintEngine implementation."""

from datetime import timedelta

from app.constraints import SUPPORTED_CONFLICT_CODES, UNSUPPORTED_CONFLICT_CODES, ConstraintEngine
from app.core.config import Settings
from contracts import Resource, ViolationSeverity
from tests.helpers import (
    NOW,
    make_planning_context,
    sample_candidate,
    sample_existing_block,
    sample_task,
    sample_train_movement,
)


def make_engine(**overrides) -> ConstraintEngine:
    return ConstraintEngine(settings=Settings(**overrides))


def test_valid_candidate_has_no_violations():
    engine = make_engine()
    violations = engine.validate(sample_candidate(), make_planning_context())
    assert violations == []


def test_duration_violation_when_window_too_short():
    engine = make_engine()
    candidate = sample_candidate(
        start_time=NOW,
        end_time=NOW + timedelta(minutes=60),
        total_duration_minutes=60,
        metadata={"required_duration_minutes": 120},
    )
    violations = engine.validate(candidate, make_planning_context())
    codes = [v.violation_code for v in violations if v.severity == ViolationSeverity.ERROR]
    assert "DURATION_CONFLICT" in codes


def test_planning_horizon_start_violation():
    engine = make_engine()
    candidate = sample_candidate(
        start_time=NOW - timedelta(hours=1),
        end_time=NOW + timedelta(hours=1),
    )
    violations = engine.validate(candidate, make_planning_context())
    horizon = [v for v in violations if v.constraint_name == "PLANNING_HORIZON"]
    assert len(horizon) == 1
    assert horizon[0].violation_code == "TIME_CONFLICT"


def test_planning_horizon_end_violation():
    engine = make_engine()
    candidate = sample_candidate(
        start_time=NOW + timedelta(days=6, hours=23),
        end_time=NOW + timedelta(days=7, hours=1),
    )
    violations = engine.validate(candidate, make_planning_context())
    horizon = [v for v in violations if v.constraint_name == "PLANNING_HORIZON"]
    assert any("ends after" in v.message for v in horizon)


def test_no_horizon_check_when_horizon_absent():
    engine = make_engine()
    context = make_planning_context(horizon_start=None, horizon_end=None)
    assert engine.validate(sample_candidate(), context) == []


def test_corridor_not_in_provided_set():
    engine = make_engine()
    context = make_planning_context(corridors=[])
    violations = engine.validate(sample_candidate(), context)
    assert violations == []

    from contracts import Corridor

    other = Corridor(
        corridor_id="COR-X", name="Other", origin_station="A", destination_station="B"
    )
    context = make_planning_context(corridors=[other])
    violations = engine.validate(sample_candidate(), context)
    codes = [v.violation_code for v in violations if v.severity == ViolationSeverity.ERROR]
    assert "CORRIDOR_CONFLICT" in codes


def test_location_section_not_in_corridor():
    engine = make_engine()
    from contracts import Corridor

    corridor = Corridor(
        corridor_id="COR-1", name="X", origin_station="A", destination_station="B",
        sections=["S2", "S3"],
    )
    context = make_planning_context(corridors=[corridor])
    violations = engine.validate(sample_candidate(section="S1"), context)
    codes = [v.violation_code for v in violations if v.severity == ViolationSeverity.ERROR]
    assert "LOCATION_CONFLICT" in codes


def test_existing_block_overlap_conflict():
    engine = make_engine()
    context = make_planning_context(existing_blocks=[sample_existing_block()])
    candidate = sample_candidate(
        start_time=NOW + timedelta(minutes=30),
        end_time=NOW + timedelta(minutes=150),
    )
    violations = engine.validate(candidate, context)
    codes = [v.violation_code for v in violations if v.severity == ViolationSeverity.ERROR]
    assert "EXISTING_BLOCK_CONFLICT" in codes


def test_existing_block_no_overlap_or_different_section():
    engine = make_engine()
    context = make_planning_context(existing_blocks=[sample_existing_block()])
    clear = sample_candidate(
        start_time=NOW + timedelta(hours=3),
        end_time=NOW + timedelta(hours=5),
    )
    assert engine.validate(clear, context) == []
    assert engine.validate(sample_candidate(section="S2"), context) == []


def test_completed_existing_block_does_not_block():
    engine = make_engine()
    block = sample_existing_block()
    block = block.model_copy(update={"status": "COMPLETED"})
    context = make_planning_context(existing_blocks=[block])
    assert engine.validate(sample_candidate(), context) == []


def test_train_movement_conflict_and_clear():
    engine = make_engine()
    movement = sample_train_movement()  # NOW .. NOW+2h on COR-1/S1
    context = make_planning_context(train_movements=[movement])
    overlapping = sample_candidate(
        start_time=NOW + timedelta(minutes=90),
        end_time=NOW + timedelta(minutes=210),
    )
    violations = engine.validate(overlapping, context)
    codes = [v.violation_code for v in violations if v.severity == ViolationSeverity.ERROR]
    assert "TRAIN_CONFLICT" in codes

    clear = sample_candidate(
        start_time=NOW + timedelta(hours=3),
        end_time=NOW + timedelta(hours=5),
    )
    assert engine.validate(clear, context) == []


def test_train_movement_only_for_same_section():
    engine = make_engine()
    movement = sample_train_movement(section="S9")
    context = make_planning_context(train_movements=[movement])
    assert engine.validate(sample_candidate(), context) == []


def test_safety_buffer_read_from_configuration():
    movement = sample_train_movement(
        departure=NOW + timedelta(hours=3),
        arrival=NOW + timedelta(hours=4),
    )
    context = make_planning_context(train_movements=[movement])
    # candidate ends exactly at the 5-minute-buffer boundary of the movement
    candidate = sample_candidate(
        start_time=NOW + timedelta(hours=2, minutes=54),
        end_time=NOW + timedelta(hours=2, minutes=55),
        total_duration_minutes=1,
        metadata={"required_duration_minutes": 1},
    )
    tight = make_engine(safety_buffer_minutes=5)
    assert tight.validate(candidate, context) == []

    generous = make_engine(safety_buffer_minutes=15)
    violations = generous.validate(candidate, context)
    codes = [v.violation_code for v in violations if v.severity == ViolationSeverity.ERROR]
    assert "TRAIN_CONFLICT" in codes


def test_resource_outside_availability_window():
    engine = make_engine()
    resource = Resource(
        resource_id="MP-01",
        resource_type="MANPOWER",
        name="Gang",
        available_from=NOW + timedelta(hours=1),
        available_until=NOW + timedelta(hours=3),
    )
    context = make_planning_context(resources=[resource])
    candidate = sample_candidate()  # NOW .. NOW+2h, requires MP-01
    violations = engine.validate(candidate, context)
    codes = [v.violation_code for v in violations if v.severity == ViolationSeverity.ERROR]
    assert "RESOURCE_CONFLICT" in codes


def test_resource_unknown_is_warning_not_blocking():
    engine = make_engine()
    context = make_planning_context(resources=[Resource(
        resource_id="RES-001", resource_type="MACHINERY", name="Machine",
    )])
    violations = engine.validate(sample_candidate(), context)
    assert violations
    assert all(v.severity == ViolationSeverity.WARNING for v in violations)
    assert engine.evaluate(sample_candidate(), context).valid is True


def test_resource_check_skipped_when_catalog_absent():
    engine = make_engine()
    context = make_planning_context(resources=[])
    assert engine.validate(sample_candidate(), context) == []


def test_goods_peak_is_blocking():
    engine = make_engine()
    from contracts import GoodsForecast

    forecast = sample_forecast(probability=0.95, window_start="05:00", window_end="07:00")
    context = make_planning_context(goods_forecasts=[forecast])
    violations = engine.validate(sample_candidate(), context)
    codes = [v.violation_code for v in violations if v.severity == ViolationSeverity.ERROR]
    assert "GOODS_CONFLICT" in codes


def test_goods_elevated_is_advisory_warning():
    engine = make_engine()
    forecast = sample_forecast(probability=0.70, window_start="05:00", window_end="07:00")
    context = make_planning_context(goods_forecasts=[forecast])
    violations = engine.validate(sample_candidate(), context)
    assert violations
    assert all(v.severity == ViolationSeverity.WARNING for v in violations)
    assert engine.evaluate(sample_candidate(), context).valid is True


def test_goods_low_probability_no_conflict():
    engine = make_engine()
    forecast = sample_forecast(probability=0.20, window_start="05:00", window_end="07:00")
    context = make_planning_context(goods_forecasts=[forecast])
    assert engine.validate(sample_candidate(), context) == []


def sample_forecast(probability, window_start, window_end):
    from datetime import time

    from contracts import GoodsForecast

    return GoodsForecast(
        forecast_id="FCST-1",
        corridor_id="COR-1",
        section="S1",
        date=NOW.date(),
        window_start=time.fromisoformat(window_start),
        window_end=time.fromisoformat(window_end),
        probability=probability,
    )


def test_no_fabricated_conflicts_when_data_absent():
    engine = make_engine()
    sparse = {
        "horizon_start": None,
        "horizon_end": None,
        "corridors": [],
        "existing_blocks": [],
        "train_movements": [],
        "goods_forecasts": [],
        "resources": [],
        "tasks": [],
    }
    assert engine.validate(sample_candidate(), sparse) == []


def test_evaluate_summarises_validity():
    engine = make_engine()
    ok = engine.evaluate(sample_candidate(), make_planning_context())
    assert ok.valid is True
    assert ok.candidate_id == "C-001"
    assert ok.error_codes == []

    bad_context = make_planning_context(corridors=[])
    from contracts import Corridor

    bad_context["corridors"] = [Corridor(
        corridor_id="COR-X", name="X", origin_station="A", destination_station="B",
    )]
    bad = engine.evaluate(sample_candidate(), bad_context)
    assert bad.valid is False
    assert bad.rejected is True
    assert bad.error_codes == ["CORRIDOR_CONFLICT"]


def test_supported_codes_and_unsupported_documented():
    engine = make_engine()
    assert engine.supported_codes == SUPPORTED_CONFLICT_CODES
    assert "API_CONFLICT" not in SUPPORTED_CONFLICT_CODES
    for code in ("POWER_CONFLICT", "DEPENDENCY_CONFLICT"):
        assert code in UNSUPPORTED_CONFLICT_CODES
        assert code in engine.unsupported_constraints
    assert all(c.value in SUPPORTED_CONFLICT_CODES for c in ())


def test_power_and_dependency_never_emitted():
    engine = make_engine()
    context = make_planning_context(
        tasks=[sample_task()],
        corridors=[],
        existing_blocks=[sample_existing_block()],
        train_movements=[sample_train_movement()],
    )
    violations = engine.validate(sample_candidate(), context)
    emitted = {v.violation_code for v in violations}
    assert emitted <= SUPPORTED_CONFLICT_CODES
    assert "POWER_CONFLICT" not in emitted
    assert "DEPENDENCY_CONFLICT" not in emitted