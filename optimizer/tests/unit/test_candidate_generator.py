"""Unit tests for the Phase 2 CandidateGenerator (determinism + behaviour)."""

from datetime import timedelta

import pytest

from app.core.config import Settings
from app.services.candidate_generator import CandidateGenerator
from contracts import BlockRequest, ViolationSeverity
from tests.helpers import (
    NOW,
    make_planning_context,
    sample_task,
    sample_train_movement,
)


def make_generator(**overrides) -> CandidateGenerator:
    return CandidateGenerator(settings=Settings(**overrides))


def dump(candidates):
    return [c.model_dump(mode="json") for c in candidates]


def test_deterministic_output_for_same_inputs():
    generator = make_generator(candidate_step_minutes=60)
    context = make_planning_context(
        tasks=[sample_task(window_start=NOW, window_end=NOW + timedelta(hours=4))],
    )
    first = dump(generator.generate_candidates([sample_task()], [], context))
    second = dump(generator.generate_candidates([sample_task()], [], context))
    assert first == second


def test_multiple_candidates_from_one_block_request():
    generator = make_generator(candidate_step_minutes=60)
    task = sample_task(estimated_duration_minutes=60)
    request = BlockRequest(
        request_id="REQ-1",
        task_ids=[task.task_id],
        corridor_id="COR-1",
        section="S1",
        requested_start=NOW,
        requested_end=NOW + timedelta(hours=3),
    )
    context = make_planning_context(block_requests=[request], tasks=[task])
    candidates = generator.generate_candidates([task], [], context)
    assert [c.candidate_id for c in candidates] == [
        "TSK-001-c000",
        "TSK-001-c001",
        "TSK-001-c002",
    ]
    assert all(c.start_time == NOW + timedelta(hours=i) for i, c in enumerate(candidates))
    assert all(c.source_request_id == "REQ-1" for c in candidates)
    assert all(c.feasible for c in candidates)


def test_insufficient_duration_yields_clamped_rejected_candidate():
    generator = make_generator(candidate_step_minutes=60)
    task = sample_task(
        estimated_duration_minutes=120,
        window_start=NOW,
        window_end=NOW + timedelta(minutes=60),
    )
    context = make_planning_context(tasks=[task])
    candidates = generator.generate_candidates([task], [], context)
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.rejected is True
    assert candidate.total_duration_minutes == 60
    assert "DURATION_CONFLICT" in candidate.rejection_codes


def test_candidates_ordered_deterministically_across_tasks():
    generator = make_generator(candidate_step_minutes=60)
    task_a = sample_task(
        task_id="TSK-B",
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
    )
    task_b = sample_task(
        task_id="TSK-A",
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
    )
    context = make_planning_context(tasks=[task_a, task_b])
    candidates = generator.generate_candidates([task_a, task_b], [], context)
    ids = [c.candidate_id for c in candidates]
    assert ids == sorted(ids)
    assert ids[0].startswith("TSK-A-")


def test_rejected_candidates_are_preserved_not_dropped():
    generator = make_generator(candidate_step_minutes=60)
    task = sample_task(window_start=NOW, window_end=NOW + timedelta(hours=4))
    movement = sample_train_movement()  # NOW .. NOW+2h on COR-1/S1
    context = make_planning_context(tasks=[task], train_movements=[movement])
    candidates = generator.generate_candidates([task], [], context)
    assert len(candidates) == 3
    assert all(c.rejected for c in candidates)
    assert all("TRAIN_CONFLICT" in c.rejection_codes for c in candidates)
    assert generator.only_feasible(candidates) == []


def test_some_candidates_rejected_some_feasible():
    generator = make_generator(candidate_step_minutes=60)
    task = sample_task(window_start=NOW, window_end=NOW + timedelta(hours=4))
    movement = sample_train_movement(
        departure=NOW,
        arrival=NOW + timedelta(minutes=30),
    )
    context = make_planning_context(tasks=[task], train_movements=[movement])
    candidates = generator.generate_candidates([task], [], context)
    feasible = generator.only_feasible(candidates)
    rejected = [c for c in candidates if c.rejected]
    assert len(feasible) + len(rejected) == 3
    assert len(feasible) == 2
    assert len(rejected) == 1


def test_no_fabricated_conflicts_when_context_data_absent():
    generator = make_generator(candidate_step_minutes=60)
    task = sample_task(
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
        metadata={"section": "S1"},
    )
    context = make_planning_context(
        tasks=[task],
        corridors=[],
        existing_blocks=[],
        train_movements=[],
        goods_forecasts=[],
        resources=[],
    )
    candidates = generator.generate_candidates([task], [], context)
    assert candidates
    assert all(c.feasible for c in candidates)
    assert all(c.violations == [] for c in candidates)


def test_window_falls_back_to_planning_horizon():
    generator = make_generator(candidate_step_minutes=60)
    task = sample_task()
    context = make_planning_context(tasks=[task])
    candidates = generator.generate_candidates([task], [], context)
    assert candidates
    assert candidates[0].metadata["window_source"] == "planning_horizon"
    assert all(c.start_time >= context["horizon_start"] for c in candidates)


def test_raises_when_no_time_information():
    generator = make_generator()
    task = sample_task()
    context = make_planning_context(
        tasks=[task],
        horizon_start=None,
        horizon_end=None,
        block_requests=[],
    )
    with pytest.raises(ValueError, match="no time window"):
        generator.generate_candidates([task], [], context)


def test_raises_when_section_unresolvable():
    generator = make_generator()
    task = sample_task(
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
        metadata={},
    )
    context = make_planning_context(tasks=[task], assets=[], block_requests=[])
    with pytest.raises(ValueError, match="cannot resolve section"):
        generator.generate_candidates([task], [], context)


def test_max_candidates_per_task_cap_respected():
    generator = make_generator(candidate_step_minutes=30, max_candidates_per_task=5)
    task = sample_task(window_start=NOW, window_end=NOW + timedelta(hours=12))
    context = make_planning_context(tasks=[task])
    candidates = generator.generate_candidates([task], [], context)
    assert len(candidates) == 5


def test_rejection_codes_are_machine_readable():
    generator = make_generator()
    task = sample_task(
        estimated_duration_minutes=240,
        window_start=NOW,
        window_end=NOW + timedelta(hours=1),
    )
    context = make_planning_context(tasks=[task])
    candidate = generator.generate_candidates([task], [], context)[0]
    assert candidate.rejection_codes == ["DURATION_CONFLICT"]
    assert all(v.violation_code for v in candidate.violations)