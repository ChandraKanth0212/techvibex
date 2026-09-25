"""Unit tests for the Phase 3A IntegratedBlockDetector.

Covers the five approved corrections:

1. disconnected feasible intervals are preserved, never bridged into false
   continuous windows;
2. ``candidate_search_exhausted`` is reported honestly (bounded scans never
   claim exhaustive incompatibility);
3. the combined block AND every participating task are validated individually;
4. maximal compatible groups only, cross-department allowed, department never
   filters, deterministic ids/ordering;
5. POWER_CONFLICT / DEPENDENCY_CONFLICT stay explicitly unsupported.
"""

from datetime import datetime, timedelta

from app.constraints.codes import (
    SUPPORTED_CONFLICT_CODES,
    UNSUPPORTED_CONFLICT_CODES,
    ConflictCode,
)
from app.constraints.engine import ConstraintEngine
from app.core.config import Settings
from app.services.integrated_block_detector import IntegratedBlockDetector
from contracts import (
    BlockCandidate,
    ExistingBlock,
    IntegratedBlock,
    IntegratedCompatibility,
    Resource,
    TrainMovement,
)
from tests.helpers import NOW, make_planning_context, sample_corridor, sample_task


def make_detector(**overrides) -> IntegratedBlockDetector:
    return IntegratedBlockDetector(settings=Settings(**overrides))


def feasible_candidates(
    task_id,
    intervals,
    *,
    duration=60,
    corridor_id="COR-1",
    section="S1",
    request_id=None,
):
    """One feasible candidate per interval for a task (multi-window capable)."""
    out = []
    for index, (start, end) in enumerate(sorted(intervals, key=lambda item: item[0])):
        out.append(
            BlockCandidate(
                candidate_id=f"{task_id}-c{index:03d}",
                task_ids=[task_id],
                corridor_id=corridor_id,
                section=section,
                start_time=start,
                end_time=start + timedelta(minutes=duration),
                total_duration_minutes=duration,
                source_request_id=request_id,
                metadata={
                    "base_window": [start.isoformat(), end.isoformat()],
                    "required_duration_minutes": duration,
                },
            )
        )
    return out


def window(start_hours: int, end_hours: int) -> tuple[datetime, datetime]:
    return (NOW + timedelta(hours=start_hours), NOW + timedelta(hours=end_hours))


def base_context(tasks, **overrides) -> dict:
    values = dict(tasks=tasks, corridors=[sample_corridor()])
    values.update(overrides)
    return make_planning_context(**values)


def simple_task(task_id, *args, **kwargs) -> dict:
    defaults = dict(required_resources=[])
    defaults.update(kwargs)
    return sample_task(task_id=task_id, **defaults)


# ------------------------------------------------------------ basic grouping


def test_two_compatible_tasks_form_one_integrated_block():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    candidates = feasible_candidates("TSK-A", [window(0, 3)]) + feasible_candidates(
        "TSK-B", [window(0, 3)]
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))

    assert len(blocks) == 1
    block = blocks[0]
    assert block.compatibility == IntegratedCompatibility.COMPATIBLE
    assert block.task_ids == ["TSK-A", "TSK-B"]
    assert block.total_required_duration_minutes == 120
    assert block.shared_possession_minutes == 120
    assert block.window_start == NOW
    assert block.window_end == NOW + timedelta(minutes=120)
    assert block.block_id == "IB-COR-1-TSK-A_TSK-B"
    assert block.violations == []


def test_three_cross_department_tasks_form_one_block():
    tasks = [
        simple_task("TSK-A", department="ENGINEERING"),
        simple_task("TSK-B", department="TRACTION"),
        simple_task("TSK-C", department="SIGNALLING"),
    ]
    candidates = (
        feasible_candidates("TSK-A", [window(0, 3)])
        + feasible_candidates("TSK-B", [window(0, 3)])
        + feasible_candidates("TSK-C", [window(0, 3)])
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))

    assert len(blocks) == 1
    block = blocks[0]
    assert block.task_ids == ["TSK-A", "TSK-B", "TSK-C"]
    assert block.participating_departments == ["ENGINEERING", "SIGNALLING", "TRACTION"]
    assert block.total_required_duration_minutes == 180


def test_no_overlap_same_corridor_no_block():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    candidates = feasible_candidates("TSK-A", [window(0, 1)]) + feasible_candidates(
        "TSK-B", [window(1, 2)]
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))
    assert blocks == []


def test_different_corridors_no_block():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B", corridor_id="COR-2")]
    candidates = feasible_candidates("TSK-A", [window(0, 3)]) + feasible_candidates(
        "TSK-B", [window(0, 3)], corridor_id="COR-2"
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))
    assert blocks == []


def test_different_section_no_block():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    candidates = feasible_candidates("TSK-A", [window(0, 3)], section="S1") + feasible_candidates(
        "TSK-B", [window(0, 3)], section="S2"
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))
    assert blocks == []


def test_common_window_too_short_for_sequential_duration_no_block():
    tasks = [
        simple_task("TSK-A", estimated_duration_minutes=90),
        simple_task("TSK-B", estimated_duration_minutes=90),
    ]
    candidates = feasible_candidates("TSK-A", [window(0, 2)], duration=90) + feasible_candidates(
        "TSK-B", [window(0, 2)], duration=90
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))
    assert blocks == []


# --------------------------------------------- correction 1: interval pieces


def test_disconnected_intervals_not_bridged_into_false_window():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    a_intervals = [window(9, 10), window(14, 15)]  # 09:00-10:00 and 14:00-15:00
    b_intervals = [window(10, 14)]  # 10:00-14:00 overlaps neither fully usable piece
    candidates = feasible_candidates("TSK-A", a_intervals, duration=30) + feasible_candidates(
        "TSK-B", b_intervals, duration=30
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))

    # Total 60 min cannot fit inside the only genuine common piece
    # [14:00, 14:30] (30 min); a naive union of A's windows would wrongly
    # produce a [10:00, 15:00] window and emit a block here.
    assert blocks == []


def test_disconnected_intervals_preserve_the_real_feasible_piece():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    # A is only available 09:00-10:00 and 11:00-12:00; B covers 10:30-13:00.
    # The only genuine common piece is [11:00, 12:00].
    candidates = feasible_candidates("TSK-A", [window(9, 10), window(11, 12)], duration=30) + feasible_candidates(
        "TSK-B", [window(10, 13)], duration=30
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))

    assert len(blocks) == 1
    block = blocks[0]
    assert block.earliest_feasible_start == NOW + timedelta(hours=11)
    assert block.latest_feasible_end == NOW + timedelta(hours=12)
    assert block.window_start == NOW + timedelta(hours=11)
    assert block.window_end == NOW + timedelta(hours=12)


# --------------------------------------------------- correction 2: exhaustion


def _train_blocked_world():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    candidates = feasible_candidates("TSK-A", [window(0, 4)]) + feasible_candidates(
        "TSK-B", [window(0, 4)]
    )
    movement = TrainMovement(
        movement_id="MOV-001",
        train_number="11007",
        corridor_id="COR-1",
        section="S1",
        departure=NOW,
        arrival=NOW + timedelta(hours=2),
    )
    context = base_context(tasks, train_movements=[movement])
    return candidates, context


def test_incompatible_group_reports_exhaustive_search_when_space_is_exhausted():
    candidates, context = _train_blocked_world()
    blocks = make_detector(candidate_step_minutes=30).detect(candidates, [], context)

    assert len(blocks) == 1
    block = blocks[0]
    assert block.compatibility == IntegratedCompatibility.INCOMPATIBLE
    assert block.rejection_codes == ["TRAIN_CONFLICT"]
    assert block.metadata["candidate_search_exhausted"] is True
    assert block.metadata["placements_examined"] == block.metadata["placements_total"] == 5


def test_incompatible_group_never_claims_exhaustion_when_scan_is_capped():
    candidates, context = _train_blocked_world()
    blocks = make_detector(
        candidate_step_minutes=30, max_placements_per_group=2
    ).detect(candidates, [], context)

    assert len(blocks) == 1
    block = blocks[0]
    assert block.compatibility == IntegratedCompatibility.INCOMPATIBLE
    assert block.metadata["candidate_search_exhausted"] is False
    assert block.metadata["placements_examined"] == 2
    assert block.metadata["placements_total"] == 5


# --------------------------------------- correction 3: per-participant check


class _CountingEngine(ConstraintEngine):
    """Wraps a real engine and counts combined vs per-task validations."""

    def __init__(self, settings=None):
        super().__init__(settings=settings)
        self.group_calls = 0
        self.single_calls = 0
        self.calls = []

    def validate(self, candidate, context):
        self.calls.append(candidate.candidate_id)
        if len(candidate.task_ids) > 1:
            self.group_calls += 1
        else:
            self.single_calls += 1
        return super().validate(candidate, context)


def test_combined_block_and_every_participant_are_validated():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B"), simple_task("TSK-C")]
    candidates = (
        feasible_candidates("TSK-A", [window(0, 3)])
        + feasible_candidates("TSK-B", [window(0, 3)])
        + feasible_candidates("TSK-C", [window(0, 3)])
    )
    engine = _CountingEngine(settings=Settings(candidate_step_minutes=30))
    detector = IntegratedBlockDetector(settings=Settings(candidate_step_minutes=30), constraint_engine=engine)
    blocks = detector.detect(candidates, [], base_context(tasks))

    assert len(blocks) == 1
    assert blocks[0].compatible
    # the winning placement validated the combined group exactly once and each
    # individual task exactly once (space is conflict-free, first placement wins)
    assert engine.group_calls == 1
    assert engine.single_calls == 3


def test_sub_slot_conflict_surfaces_as_group_rejection_reason():
    tasks = [
        simple_task("TSK-A", estimated_duration_minutes=30),
        simple_task("TSK-B", estimated_duration_minutes=150),
    ]
    candidates = feasible_candidates("TSK-A", [window(0, 3)], duration=30) + feasible_candidates(
        "TSK-B", [window(0, 3)], duration=150
    )
    movement = TrainMovement(
        movement_id="MOV-002",
        train_number="11008",
        corridor_id="COR-1",
        section="S1",
        departure=NOW + timedelta(minutes=45),
        arrival=NOW + timedelta(minutes=90),
    )
    context = base_context(tasks, train_movements=[movement])
    blocks = make_detector(candidate_step_minutes=30).detect(candidates, [], context)

    assert len(blocks) == 1
    assert blocks[0].compatibility == IntegratedCompatibility.INCOMPATIBLE
    assert "TRAIN_CONFLICT" in blocks[0].rejection_codes


# ----------------------------------------- correction 4: maximal & deterministic


def test_maximal_group_size_is_respected_as_force_cap():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B"), simple_task("TSK-C")]
    candidates = (
        feasible_candidates("TSK-A", [window(0, 3)])
        + feasible_candidates("TSK-B", [window(0, 3)])
        + feasible_candidates("TSK-C", [window(0, 3)])
    )
    blocks = make_detector(max_integrated_group_size=2).detect(candidates, [], base_context(tasks))

    assert len(blocks) == 3
    assert all(len(block.task_ids) == 2 for block in blocks)
    assert [block.block_id for block in blocks] == [
        "IB-COR-1-TSK-A_TSK-B",
        "IB-COR-1-TSK-A_TSK-C",
        "IB-COR-1-TSK-B_TSK-C",
    ]


def test_four_compatible_tasks_emit_single_maximal_block():
    tasks = [simple_task(f"TSK-{suffix}") for suffix in ("A", "B", "C", "D")]
    candidates = (
        feasible_candidates("TSK-A", [window(0, 4)])
        + feasible_candidates("TSK-B", [window(0, 4)])
        + feasible_candidates("TSK-C", [window(0, 4)])
        + feasible_candidates("TSK-D", [window(0, 4)])
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))

    assert len(blocks) == 1
    assert blocks[0].task_ids == ["TSK-A", "TSK-B", "TSK-C", "TSK-D"]


def test_output_is_deterministic_and_sorted():
    tasks = [
        simple_task("TSK-A"),
        simple_task("TSK-B"),
        simple_task("TSK-C", corridor_id="COR-2"),
        simple_task("TSK-D", corridor_id="COR-2"),
    ]
    candidates = (
        feasible_candidates("TSK-A", [window(0, 3)])
        + feasible_candidates("TSK-B", [window(0, 3)])
        + feasible_candidates("TSK-C", [window(0, 3)], corridor_id="COR-2")
        + feasible_candidates("TSK-D", [window(0, 3)], corridor_id="COR-2")
    )
    context = base_context(tasks, corridors=[sample_corridor(), sample_corridor(corridor_id="COR-2")])
    detector = make_detector()
    first = detector.detect(candidates, [], context)
    second = detector.detect(candidates, [], context)

    assert [block.block_id for block in first] == [block.block_id for block in second] == sorted(
        [block.block_id for block in first]
    )
    assert [b.model_dump(mode="json") for b in first] == [b.model_dump(mode="json") for b in second]


def test_department_is_reported_where_available_and_never_filters():
    tasks = [
        simple_task("TSK-A", department="ENGINEERING"),
        simple_task("TSK-B"),
    ]
    candidates = feasible_candidates("TSK-A", [window(0, 3)]) + feasible_candidates(
        "TSK-B", [window(0, 3)]
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))

    assert len(blocks) == 1
    assert blocks[0].compatible
    # the department-less task still integrates (department is not an exclusion)
    assert blocks[0].participating_departments == ["ENGINEERING"]


def test_department_reads_metadata_fallback():
    tasks = [
        simple_task("TSK-A", metadata={"department": "SIGNALLING"}),
        simple_task("TSK-B"),
    ]
    candidates = feasible_candidates("TSK-A", [window(0, 3)]) + feasible_candidates(
        "TSK-B", [window(0, 3)]
    )
    blocks = make_detector().detect(candidates, [], base_context(tasks))
    assert blocks[0].participating_departments == ["SIGNALLING"]


def test_request_ids_aggregated():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    candidates = feasible_candidates(
        "TSK-A", [window(0, 3)], request_id="REQ-A"
    ) + feasible_candidates("TSK-B", [window(0, 3)], request_id="REQ-B")
    blocks = make_detector().detect(candidates, [], base_context(tasks))
    assert blocks[0].request_ids == ["REQ-A", "REQ-B"]


# ------------------------------------------------------------ other conflicts


def test_existing_block_conflict_blocks_integration():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    candidates = feasible_candidates("TSK-A", [window(0, 4)]) + feasible_candidates(
        "TSK-B", [window(0, 4)]
    )
    block = ExistingBlock(
        block_id="BLK-001",
        corridor_id="COR-1",
        section="S1",
        start_time=NOW,
        end_time=NOW + timedelta(hours=5),
    )
    context = base_context(tasks, existing_blocks=[block])
    blocks = make_detector(candidate_step_minutes=30).detect(candidates, [], context)

    assert len(blocks) == 1
    assert blocks[0].compatibility == IntegratedCompatibility.INCOMPATIBLE
    assert blocks[0].rejection_codes == ["EXISTING_BLOCK_CONFLICT"]


def test_resource_conflict_blocks_integration():
    tasks = [
        simple_task("TSK-A", required_resources=["RES-001"]),
        simple_task("TSK-B", required_resources=["RES-001"]),
    ]
    candidates = feasible_candidates("TSK-A", [window(2, 4)]) + feasible_candidates(
        "TSK-B", [window(2, 4)]
    )
    resource = Resource(
        resource_id="RES-001",
        resource_type="MANPOWER",
        name="Track gang 7",
        available_from=NOW,
        available_until=NOW + timedelta(hours=1),
    )
    context = base_context(tasks, resources=[resource])
    blocks = make_detector().detect(candidates, [], context)

    assert len(blocks) == 1
    assert blocks[0].compatibility == IntegratedCompatibility.INCOMPATIBLE
    assert "RESOURCE_CONFLICT" in blocks[0].rejection_codes


# ------------------------------------ honest absence / unsupported constraints


def test_no_fabricated_conflicts_when_context_data_absent():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B")]
    candidates = feasible_candidates("TSK-A", [window(0, 3)]) + feasible_candidates(
        "TSK-B", [window(0, 3)]
    )
    context = make_planning_context(
        tasks=tasks,
        corridors=[sample_corridor()],
        existing_blocks=[],
        train_movements=[],
        goods_forecasts=[],
        resources=[],
    )
    blocks = make_detector().detect(candidates, [], context)

    assert len(blocks) == 1
    assert blocks[0].compatible
    assert blocks[0].violations == []


def test_unsupported_conflict_codes_are_never_emitted():
    candidates, context = _train_blocked_world()
    blocks = make_detector().detect(candidates, [], context)

    assert blocks[0].rejection_codes == ["TRAIN_CONFLICT"]
    assert ConflictCode.POWER_CONFLICT.value not in blocks[0].rejection_codes
    assert ConflictCode.DEPENDENCY_CONFLICT.value not in blocks[0].rejection_codes
    assert ConflictCode.POWER_CONFLICT.value in UNSUPPORTED_CONFLICT_CODES
    assert ConflictCode.DEPENDENCY_CONFLICT.value in UNSUPPORTED_CONFLICT_CODES
    assert ConflictCode.POWER_CONFLICT.value not in SUPPORTED_CONFLICT_CODES
    assert ConflictCode.DEPENDENCY_CONFLICT.value not in SUPPORTED_CONFLICT_CODES


# ----------------------------------------------------------- bounded outputs


def test_max_integrated_groups_limit_applied_deterministically():
    tasks = [
        simple_task("TSK-A"),
        simple_task("TSK-B"),
        simple_task("TSK-C", corridor_id="COR-2"),
        simple_task("TSK-D", corridor_id="COR-2"),
    ]
    candidates = (
        feasible_candidates("TSK-A", [window(0, 3)])
        + feasible_candidates("TSK-B", [window(0, 3)])
        + feasible_candidates("TSK-C", [window(0, 3)], corridor_id="COR-2")
        + feasible_candidates("TSK-D", [window(0, 3)], corridor_id="COR-2")
    )
    context = base_context(tasks, corridors=[sample_corridor(), sample_corridor(corridor_id="COR-2")])
    blocks = make_detector(max_integrated_groups=1).detect(candidates, [], context)

    assert len(blocks) == 1
    assert blocks[0].task_ids == ["TSK-A", "TSK-B"]


def test_to_integrated_block_bridge():
    tasks = [simple_task("TSK-A"), simple_task("TSK-B"), simple_task("TSK-C")]
    candidates = (
        feasible_candidates("TSK-A", [window(0, 3)])
        + feasible_candidates("TSK-B", [window(0, 3)])
        + feasible_candidates("TSK-C", [window(0, 3)])
    )
    block = make_detector().detect(candidates, [], base_context(tasks))[0]
    integrated: IntegratedBlock = block.to_integrated_block()

    assert integrated.block_id == "IB-COR-1-TSK-A_TSK-B_TSK-C"
    assert integrated.task_ids == ["TSK-A", "TSK-B", "TSK-C"]
    assert integrated.corridor_id == "COR-1"
    assert integrated.section == "S1"
    assert integrated.start_time == block.window_start
    assert integrated.end_time == block.window_end
    assert integrated.shared_possession_minutes == 180