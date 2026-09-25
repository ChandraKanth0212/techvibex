"""Demo pipeline contract (Phase 7B): the real app pipeline over the demo worlds.

Drives :meth:`app.services.pipeline.PlanBuilder.generate` with each scenario's
own ``request`` + ``context`` and asserts the outcome contract: a result, a
validation, metrics and an explanation, with every scoped task accounted for.

``scenario_c`` and ``scenario_f`` deliberately carry no request (they are
advisory/forecast worlds demonstrated through candidate generation, not an
optimisation request), so they are executed against the pipeline's documented
"request required" behaviour instead.

Scenario A and J need a positive ``slot_consolidation`` objective weight to
select the integrated block over the tied sum-of-singles objective, exactly as
the demo runner does.

All demo material is synthetic (seeded, deterministic).
"""

import pytest

from app.core.config import ObjectiveWeights, Settings
from app.services.pipeline import PlanBuilder, PipelineError

from demo_data import all_scenarios, get_scenario

#: Scenarios whose expected outcome is the consolidated integrated block.
BOOSTED_SCENARIOS = {"scenario_a", "scenario_j"}

#: Worlds documented without an optimisation request.
REQUESTLESS_SCENARIOS = {"scenario_c", "scenario_f"}


def _settings_for(scenario_id: str) -> Settings:
    weights = ObjectiveWeights(
        slot_consolidation=2.0 if scenario_id in BOOSTED_SCENARIOS else 1.0
    )
    return Settings(demo_mode=True, objective_weights=weights)


def test_scenarios_without_a_request_raise_the_documented_error():
    for scenario in all_scenarios():
        if scenario.scenario_id not in REQUESTLESS_SCENARIOS:
            continue
        assert scenario.request is None
        with pytest.raises(PipelineError):
            PlanBuilder().generate(
                request=None, context=scenario.context, settings=_settings_for(scenario.scenario_id)
            )


@pytest.mark.parametrize(
    "scenario",
    [s for s in all_scenarios() if s.scenario_id not in REQUESTLESS_SCENARIOS],
    ids=lambda s: s.scenario_id,
)
def test_generate_runs_over_every_requested_demo_scenario(scenario):
    settings = _settings_for(scenario.scenario_id)
    outcome = PlanBuilder(settings=settings).generate(
        request=scenario.request, context=scenario.context, settings=settings
    )

    assert outcome.result is not None
    assert outcome.validation is not None
    assert outcome.metrics is not None
    assert outcome.explanation is not None
    assert outcome.validation.valid is True

    scheduled = set(outcome.result.scheduled_task_ids)
    unscheduled = set(outcome.result.unscheduled_task_ids)
    assert scheduled.isdisjoint(unscheduled)
    # every requested task is accounted for exactly once
    assert set(scenario.request.task_ids) == scheduled | unscheduled


def test_scenario_a_selects_the_integrated_three_task_block():
    scenario = get_scenario("scenario_a")
    settings = _settings_for("scenario_a")
    outcome = PlanBuilder(settings=settings).generate(
        request=scenario.request, context=scenario.context, settings=settings
    )
    assert outcome.validation.valid is True
    assert set(outcome.result.scheduled_task_ids) == set(scenario.request.task_ids)
    assert outcome.metrics.integrated_blocks_count == 1
    assert outcome.explanation.records


def test_scenario_j_schedules_the_feasible_subset():
    scenario = get_scenario("scenario_j")
    settings = _settings_for("scenario_j")
    outcome = PlanBuilder(settings=settings).generate(
        request=scenario.request, context=scenario.context, settings=settings
    )
    assert outcome.validation.valid is True
    assert outcome.metrics.integrated_blocks_count == 1

    expected = scenario.expected
    scheduled = set(outcome.result.scheduled_task_ids)
    # the integrable pair and the clear task are placed; the two hard-rejected
    # tasks (peak goods, approved block) stay unscheduled
    assert expected["integrated_pair"][0] in scheduled
    assert expected["integrated_pair"][1] in scheduled
    assert expected["clear_task"] in scheduled
    assert expected["goods_rejected"] not in scheduled
    assert expected["block_rejected"] not in scheduled


def test_scenario_d_rejects_every_candidate_with_train_conflict():
    scenario = get_scenario("scenario_d")
    settings = _settings_for("scenario_d")
    outcome = PlanBuilder(settings=settings).generate(
        request=scenario.request, context=scenario.context, settings=settings
    )
    assert set(outcome.result.scheduled_task_ids) == set()
    assert set(scenario.request.task_ids) == set(outcome.result.unscheduled_task_ids)


def test_scenario_g_schedules_at_most_one_of_the_resource_pair():
    scenario = get_scenario("scenario_g")
    settings = _settings_for("scenario_g")
    outcome = PlanBuilder(settings=settings).generate(
        request=scenario.request, context=scenario.context, settings=settings
    )
    assert len(outcome.result.scheduled_task_ids) <= 1
