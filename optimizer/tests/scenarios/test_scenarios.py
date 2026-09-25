"""Phase 2 scenario tests: pipelines over synthetic worlds.

Each scenario exercises the full CandidateGenerator + ConstraintEngine chain
over a small synthetic context, mirroring the conceptual cases from the spec:

- two tasks that can coexist
- two tasks where one collides with a protected train
- two tasks with incompatible corridor / time windows
- a task with insufficient available duration
"""

from datetime import timedelta

from app.core.config import Settings
from app.services.candidate_generator import CandidateGenerator
from contracts import ViolationSeverity
from tests.helpers import (
    NOW,
    make_planning_context,
    sample_task,
    sample_train_movement,
)


def generator() -> CandidateGenerator:
    return CandidateGenerator(settings=Settings(candidate_step_minutes=60))


def error_codes(candidate) -> list[str]:
    return [
        v.violation_code
        for v in candidate.violations
        if v.severity == ViolationSeverity.ERROR
    ]


def test_scenario_two_tasks_can_coexist():
    task_a = sample_task(
        task_id="TSK-A",
        asset_id="AST-001",
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
    )
    task_b = sample_task(
        task_id="TSK-B",
        asset_id="AST-001",
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
    )
    context = make_planning_context(tasks=[task_a, task_b])
    candidates = generator().generate_candidates([task_a, task_b], [], context)
    assert len(candidates) == 2
    assert all(c.feasible for c in candidates)
    assert all(c.violations == [] for c in candidates)


def test_scenario_two_tasks_one_blocked_by_train():
    task_on_s1 = sample_task(
        task_id="TSK-A",
        asset_id="AST-001",
        window_start=NOW,
        window_end=NOW + timedelta(hours=3),
    )
    task_on_s2 = sample_task(
        task_id="TSK-B",
        asset_id="AST-002",
        window_start=NOW,
        window_end=NOW + timedelta(hours=3),
        metadata={"section": "S2"},
    )
    movement = sample_train_movement()  # NOW .. NOW+2h on COR-1/S1
    context = make_planning_context(
        tasks=[task_on_s1, task_on_s2],
        train_movements=[movement],
    )
    candidates = generator().generate_candidates(
        [task_on_s1, task_on_s2], [], context,
    )
    a_candidates = [c for c in candidates if c.task_ids == ["TSK-A"]]
    b_candidates = [c for c in candidates if c.task_ids == ["TSK-B"]]

    assert a_candidates
    assert all(c.rejected for c in a_candidates)
    assert all("TRAIN_CONFLICT" in error_codes(c) for c in a_candidates)
    assert b_candidates
    assert all(c.feasible for c in b_candidates)


def test_scenario_two_tasks_incompatible_corridor():
    task_known = sample_task(
        task_id="TSK-A",
        asset_id="AST-001",
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
    )
    task_unknown_corridor = sample_task(
        task_id="TSK-B",
        corridor_id="COR-UNKNOWN",
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
        metadata={"section": "S9"},
    )
    corridor = make_planning_context()["corridors"][0]
    context = make_planning_context(tasks=[task_known, task_unknown_corridor])
    candidates = generator().generate_candidates(
        [task_known, task_unknown_corridor], [corridor], context,
    )
    known = [c for c in candidates if c.task_ids == ["TSK-A"]]
    unknown = [c for c in candidates if c.task_ids == ["TSK-B"]]
    assert known
    assert all(c.feasible for c in known)
    assert unknown
    assert all(c.rejected for c in unknown)
    assert all("CORRIDOR_CONFLICT" in error_codes(c) for c in unknown)


def test_scenario_insufficient_available_duration():
    task = sample_task(
        task_id="TSK-A",
        asset_id="AST-001",
        estimated_duration_minutes=240,
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
    )
    context = make_planning_context(tasks=[task])
    candidates = generator().generate_candidates([task], [], context)
    assert len(candidates) == 1
    assert candidates[0].rejected
    assert "DURATION_CONFLICT" in candidates[0].rejection_codes