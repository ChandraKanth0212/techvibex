"""Phase 3A scenario tests: CandidateGenerator -> IntegratedBlockDetector chains.

Each scenario runs the real pipeline over a small synthetic world and asserts
integrated-block behaviour end to end:

- independent requests on two corridors consolidate into two integrated blocks;
- a protected train blocks integration on one corridor while the other is free;
- three cross-department tasks on one corridor collapse into a single block.
"""

from datetime import timedelta

from app.core.config import Settings
from app.services.candidate_generator import CandidateGenerator
from app.services.integrated_block_detector import IntegratedBlockDetector
from contracts import IntegratedCompatibility
from tests.helpers import (
    NOW,
    make_planning_context,
    sample_corridor,
    sample_task,
    sample_train_movement,
)


def generator() -> CandidateGenerator:
    return CandidateGenerator(settings=Settings(candidate_step_minutes=60))


def detector() -> IntegratedBlockDetector:
    return IntegratedBlockDetector(settings=Settings(candidate_step_minutes=30))


def task(task_id, corridor_id, corridor_ok=True, **overrides) -> dict:
    defaults = dict(
        estimated_duration_minutes=90,
        required_resources=[],
        metadata={"section": "S1" if corridor_id == "COR-1" else "S2"},
        window_start=NOW,
        window_end=NOW + timedelta(hours=3),
    )
    defaults.update(overrides)
    return sample_task(task_id=task_id, corridor_id=corridor_id, **defaults)


def corridors_for(*ids) -> list:
    result = []
    for corridor_id in ids:
        sections = ["S1"] if corridor_id == "COR-1" else ["S2"]
        result.append(sample_corridor(corridor_id=corridor_id, sections=sections))
    return result


def test_scenario_two_corridors_two_integrated_blocks():
    corr1 = corridors_for("COR-1", "COR-2")
    tasks = [
        task("TSK-A", "COR-1"),
        task("TSK-B", "COR-1"),
        task("TSK-C", "COR-2"),
        task("TSK-D", "COR-2"),
    ]
    context = make_planning_context(tasks=tasks, corridors=corr1)

    candidates = generator().generate_candidates(tasks, corr1, context)
    feasible = generator().only_feasible(candidates)
    blocks = detector().detect(feasible, corr1, context)

    assert len(blocks) == 2
    by_corridor = {}
    for block in blocks:
        by_corridor.setdefault(block.corridor_id, []).append(block)
    assert set(by_corridor) == {"COR-1", "COR-2"}
    for group in by_corridor.values():
        assert len(group) == 1
        assert group[0].compatibility == IntegratedCompatibility.COMPATIBLE
        assert len(group[0].task_ids) == 2


def test_scenario_train_blocks_integration_and_preserves_reason():
    corr = corridors_for("COR-1")
    tasks = [
        task("TSK-A", "COR-1", estimated_duration_minutes=60, window_end=NOW + timedelta(hours=4)),
        task("TSK-B", "COR-1", estimated_duration_minutes=60, window_end=NOW + timedelta(hours=4)),
    ]
    movement = sample_train_movement()  # NOW .. NOW+2h on COR-1/S1
    context = make_planning_context(tasks=tasks, corridors=corr, train_movements=[movement])

    candidates = generator().generate_candidates(tasks, corr, context)
    feasible = generator().only_feasible(candidates)
    blocks = detector().detect(feasible, corr, context)

    # both tasks still have a feasible individual placement (after the train),
    # but no sequential pair fits inside the common window without hitting it
    assert len(blocks) == 1
    block = blocks[0]
    assert block.compatibility == IntegratedCompatibility.INCOMPATIBLE
    assert "TRAIN_CONFLICT" in block.rejection_codes
    assert block.metadata["candidate_search_exhausted"] is True


def test_scenario_three_departments_single_block():
    corr = corridors_for("COR-1")
    tasks = [
        task("TSK-A", "COR-1", department="ENGINEERING", estimated_duration_minutes=60),
        task("TSK-B", "COR-1", department="TRACTION", estimated_duration_minutes=60),
        task("TSK-C", "COR-1", department="SIGNALLING", estimated_duration_minutes=60),
    ]
    context = make_planning_context(tasks=tasks, corridors=corr)

    candidates = generator().generate_candidates(tasks, corr, context)
    feasible = generator().only_feasible(candidates)
    blocks = detector().detect(feasible, corr, context)

    assert len(blocks) == 1
    block = blocks[0]
    assert block.compatible
    assert block.task_ids == ["TSK-A", "TSK-B", "TSK-C"]
    assert block.participating_departments == ["ENGINEERING", "SIGNALLING", "TRACTION"]
    assert block.total_required_duration_minutes == 180