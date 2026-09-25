"""Phase 7B demo scenario catalogue (A-J) contract.

Each scenario in ``demo_data`` is a self-contained, deterministic world: a
stable id, a human name/description, a full synthetic ``context``, a
``request`` scoped strictly to *that* world's own tasks (``None`` for the
advisory-only worlds), and an ``expected`` dict recording the pipeline property
the scenario demonstrates.

Everything here is *synthetic* (seeded, deterministic), never live Indian
Railways data — that is the Phase 7B contract and the tests lock it in.
"""

import pytest

from demo_data import (
    SCENARIO_IDS,
    all_scenarios,
    get_scenario,
)


def test_exactly_ten_scenarios_registered_in_stable_order():
    assert len(SCENARIO_IDS) == 10
    assert SCENARIO_IDS == [
        "scenario_a",
        "scenario_b",
        "scenario_c",
        "scenario_d",
        "scenario_e",
        "scenario_f",
        "scenario_g",
        "scenario_h",
        "scenario_i",
        "scenario_j",
    ]
    assert [s.scenario_id for s in all_scenarios()] == SCENARIO_IDS


def test_get_scenario_round_trips_every_public_id():
    for scenario_id in SCENARIO_IDS:
        assert get_scenario(scenario_id).scenario_id == scenario_id


def test_get_scenario_rejects_unknown():
    with pytest.raises(KeyError):
        get_scenario("scenario_nope")


def test_every_scenario_carries_full_annotation():
    for scenario in all_scenarios():
        assert scenario.scenario_id
        assert scenario.name
        assert scenario.description
        assert scenario.context is not None
        assert scenario.context.tasks
        assert isinstance(scenario.expected, dict)
        assert isinstance(scenario.extra, dict)
        assert scenario.describe().startswith(f"[{scenario.scenario_id}]")


def test_every_request_is_scoped_to_its_own_context():
    for scenario in all_scenarios():
        own_task_ids = {task.task_id for task in scenario.context.tasks}
        if scenario.request is None:
            continue
        assert scenario.request.task_ids
        assert set(scenario.request.task_ids) <= own_task_ids


def test_scenario_identity_and_expectations_are_deterministic():
    def fingerprint():
        return [
            (
                s.scenario_id,
                s.name,
                s.description,
                tuple(t.task_id for t in s.context.tasks),
                tuple(r.request_id for r in s.context.block_requests),
                tuple(s.request.task_ids) if s.request is not None else None,
                tuple(sorted(s.expected.items())),
            )
            for s in all_scenarios()
        ]

    assert fingerprint() == fingerprint()


def test_scenario_a_demonstrates_the_triple_block_showcase():
    scenario = get_scenario("scenario_a")
    assert scenario.expected == {
        "group_size": 3,
        "departments": 3,
        "requires_slot_boost": True,
    }
    assert len(scenario.request.task_ids) == 3
    departments = {
        task.department
        for task in scenario.context.tasks
        if task.task_id in set(scenario.request.task_ids)
    }
    assert len(departments) == 3


def test_scenario_b_demonstrates_department_consolidation():
    scenario = get_scenario("scenario_b")
    assert scenario.expected == {"group_size": 2, "departments": 2}
    assert len(scenario.request.task_ids) == 2


def test_scenario_c_demonstrates_goods_forecast_decisions():
    scenario = get_scenario("scenario_c")
    assert scenario.expected == {
        "advisory_code": "GOODS_CONFLICT",
        "advisory_feasible": True,
        "peak_code": "GOODS_CONFLICT",
        "peak_feasible": False,
    }
    # advisory/peak worlds are demonstrated through candidate generation, so the
    # scenario intentionally carries no optimisation request
    assert scenario.request is None
    assert scenario.context.goods_forecasts


def test_scenario_d_demonstrates_train_movement_protection():
    scenario = get_scenario("scenario_d")
    assert scenario.expected == {"code": "TRAIN_CONFLICT", "feasible_candidates": 0}
    assert scenario.context.train_movements


def test_scenario_e_demonstrates_existing_block_protection():
    scenario = get_scenario("scenario_e")
    assert scenario.expected == {"code": "EXISTING_BLOCK_CONFLICT", "feasible_candidates": 0}
    assert scenario.context.existing_blocks


def test_scenario_f_demonstrates_duration_feasibility():
    scenario = get_scenario("scenario_f")
    assert scenario.expected == {
        "no_common_group": True,
        "code": "DURATION_CONFLICT",
        "short_task_id": "T-F03",
    }
    short = next(t for t in scenario.context.tasks if t.task_id == "T-F03")
    assert (short.window_end - short.window_start).total_seconds() / 60 < (
        short.estimated_duration_minutes
    )


def test_scenario_g_demonstrates_resource_capacity():
    scenario = get_scenario("scenario_g")
    assert scenario.expected == {
        "code": "RESOURCE_CONFLICT",
        "resource_id": "RES-G01",
        "scheduled_at_most_one": True,
    }
    resource = next(r for r in scenario.context.resources if r.resource_id == "RES-G01")
    assert resource.capacity == 1


def test_scenario_h_demonstrates_dependency_metadata_only():
    scenario = get_scenario("scenario_h")
    assert scenario.expected == {"code": "DEPENDENCY_CONFLICT", "emitted": False}
    dependent = next(t for t in scenario.context.tasks if t.task_id == "T-H02")
    assert dependent.metadata.get("depends_on") == ["T-H01"]
    # the schema has no prerequisite field, so the code can never be emitted
    assert not hasattr(dependent, "depends_on")


def test_scenario_i_is_documentation_only_fixture():
    scenario = get_scenario("scenario_i")
    assert scenario.expected == {}
    assert "original_context" in scenario.extra
    assert "replan_context" in scenario.extra


def test_scenario_j_demonstrates_the_full_works():
    scenario = get_scenario("scenario_j")
    assert scenario.expected == {
        "integrated_pair": ["T-J01", "T-J02"],
        "clear_task": "T-J03",
        "goods_rejected": "T-J04",
        "block_rejected": "T-J05",
    }
    assert scenario.context.goods_forecasts
    assert scenario.context.existing_blocks
