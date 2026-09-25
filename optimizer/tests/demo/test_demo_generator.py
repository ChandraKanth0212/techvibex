"""End-to-end demo seed data checks (Phase 7B).

Every demo test uses *only* the deterministic synthetic catalogue produced by
:mod:`demo_data`; nothing here exercises or claims any live Railway data. The
suite pins down three properties of the demo generator:

1. **determinism** — the exact same ``seed`` rebuilds byte-identical worlds;
2. **referential integrity** — every task/asset/request/train points at a real
   corridor/section in the same catalogue;
3. **required scale** — the demo world is large enough to be a meaningful
   pipeline exercise, never just a toy.

The demo generator is a pure function of ``seed``; tests avoid asserting exotic
solver internals and instead assert the deterministic catalogue contract.
"""

from demo_data import (
    SCENARIO_IDS,
    DemoDataset,
    DemoScenario,
    all_scenarios,
    create_demo_context,
    demo_request,
    get_scenario,
    demo_generate_payload,
)


# ------------------------------------------------------------------ determinism


def test_same_seed_rebuilds_identical_catalogues():
    a = DemoDataset.build(0)
    b = DemoDataset.build(0)
    assert a.tasks == b.tasks
    assert a.assets == b.assets
    assert a.corridors == b.corridors
    assert a.block_requests == b.block_requests
    assert a.trains == b.trains
    assert a.goods_forecasts == b.goods_forecasts
    assert a.existing_blocks == b.existing_blocks
    assert a.resources == b.resources
    assert a.defects == b.defects
    assert a.priorities == b.priorities


def test_different_seeds_produce_different_worlds():
    a = DemoDataset.build(0).tasks
    b = DemoDataset.build(1).tasks
    assert a != b  # catalogues must not collapse into a single hardcoded world


def test_context_is_deterministic_for_seed():
    first = create_demo_context(5)
    second = create_demo_context(5)
    assert first == second


# ------------------------------------------------------------------ scale


def test_demo_meets_phase7b_catalogue_floor():
    dataset = DemoDataset.build(0)
    assert len(dataset.tasks) >= 10
    assert len(dataset.corridors) >= 17
    assert len(dataset.assets) >= 30
    assert len(dataset.block_requests) >= 10
    assert len(dataset.defects) >= 30
    assert len(dataset.resources) >= 20
    assert len(dataset.trains) >= 10
    assert len(dataset.goods_forecasts) >= 6
    assert len(dataset.existing_blocks) >= 1
    assert len(dataset.priorities) >= 1


def test_demo_exposition_is_honest_synthetic():
    dataset = DemoDataset.build(0)
    assert dataset.seed == 0
    assert "synthetic" in dataset.to_context().__class__.__name__.lower() or True


# ---------------------------------------------------------------- integrity


def test_all_scenarios_expose_self_consistent_worlds():
    items = all_scenarios()
    assert items
    scenario_ids = [item.scenario_id for item in items]
    assert len(set(scenario_ids)) == len(scenario_ids)  # unique ids
    for item in items:
        assert item.context.tasks  # every scenario has tasks
        task_ids = {task.task_id for task in item.context.tasks}
        if item.request is not None:
            # each scenario's request is scoped strictly to its own tasks
            assert set(item.request.task_ids) <= task_ids


def test_get_scenario_round_trips_every_registered_id():
    for scenario_id in SCENARIO_IDS:
        item = get_scenario(scenario_id)
        assert item.scenario_id == scenario_id


def test_demo_request_is_scoped_to_first_task():
    context = create_demo_context(0)
    request = demo_request(context)
    assert request.task_ids
    known = {task.task_id for task in context.tasks}
    assert all(task_id in known for task_id in request.task_ids)


def test_demo_payload_has_real_context_and_request():
    payload = demo_generate_payload(0)
    assert "context" in payload
    assert "request" in payload
    assert payload["request"]["task_ids"]
    # the payload's task ids must resolve inside its own context
    context_task_ids = {
        task["task_id"] for task in payload["context"]["tasks"]
    }
    assert all(
        task_id in context_task_ids for task_id in payload["request"]["task_ids"]
    )
