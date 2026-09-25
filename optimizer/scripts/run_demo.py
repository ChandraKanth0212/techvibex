"""End-to-end demo runner (Phase 7B).

Builds the deterministic SYNTHETIC_DEMO dataset, runs the full Module 3 pipeline
(candidate generation -> integrated-block detection -> CP-SAT schedule
optimization -> independent validation -> metrics -> explanations) for the
catalogue and for every scenario A-J, and prints a concise summary.

Run from the ``optimizer`` directory::

    python -m scripts.run_demo
    python scripts/run_demo.py

Everything is computed from the generated data / the pipeline outputs; no metric
is fabricated.
"""

from __future__ import annotations

import os
import sys

# Make `app`, `contracts` and `demo_data` importable regardless of how the
# script is launched (module mode already adds `optimizer` to sys.path[0]).
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app.core.config import ObjectiveWeights, Settings
from app.services.pipeline import PlanBuilder, PipelineError
from demo_data import SYNTHETIC_DEMO_DISCLAIMER, DemoDataset, all_scenarios, demo_request
from demo_data.scenarios import DemoScenario


def demo_settings(scenario_id: str | None = None) -> Settings:
    """Demo settings; Scenario A (and J) boost slot_consolidation to break the
    integrated-vs-singles objective tie and deterministically select the block."""
    weights = ObjectiveWeights(
        slot_consolidation=2.0 if scenario_id in {"scenario_a", "scenario_j"} else 1.0
    )
    return Settings(demo_mode=True, objective_weights=weights)


def run_generate(
    pipeline: PlanBuilder,
    request,
    context,
    scenario_id: str | None = None,
) -> dict:
    """Run the pipeline and return a compact summary mapping (for printing)."""
    outcome = pipeline.generate(request, context, demo_settings(scenario_id))
    result = outcome.result
    metrics = outcome.metrics
    return {
        "plan_id": outcome.plan_id,
        "status": result.status,
        "scheduled": len(result.scheduled_task_ids),
        "unscheduled": len(result.unscheduled_task_ids),
        "coverage": None if metrics is None else metrics.task_coverage_ratio,
        "integrated": None if metrics is None else metrics.integrated_blocks_count,
        "validation": outcome.validation.valid,
        "errors": len(outcome.validation.errors),
        "warnings": len(outcome.validation.warnings),
        "rejections": outcome.candidate_rejection_codes,
        "scheduled_ids": result.scheduled_task_ids[:6],
    }


def print_summary(title: str, summary: dict) -> None:
    print(f"\n== {title}")
    print(f"  plan        : {summary['plan_id']}  status={summary['status']}")
    print(
        f"  scheduled   : {summary['scheduled']}  unscheduled={summary['unscheduled']}"
        f"  coverage={summary['coverage']}  integrated={summary['integrated']}"
    )
    print(
        f"  validation  : valid={summary['validation']} errors={summary['errors']}"
        f" warnings={summary['warnings']}"
    )
    if summary["rejections"]:
        joined = ",".join(f"{code}={count}" for code, count in summary["rejections"].items())
        print(f"  rejections  : {joined}")
    if summary["scheduled_ids"]:
        print(f"  scheduled   : {', '.join(summary['scheduled_ids'])}")


def run_scenario(pipeline: PlanBuilder, scenario: DemoScenario) -> dict:
    if scenario.request is None:
        return {"plan_id": None, "status": "SKIPPED (no request)", "scheduled": 0,
                "unscheduled": 0, "coverage": None, "integrated": None,
                "validation": None, "errors": 0, "warnings": 0,
                "rejections": {}, "scheduled_ids": []}
    return run_generate(pipeline, scenario.request, scenario.context, scenario.scenario_id)


def main() -> int:
    print(SYNTHETIC_DEMO_DISCLAIMER)
    pipeline = PlanBuilder()

    print("\n=== Demo dataset (seed=0) ===")
    dataset = DemoDataset.build(seed=0)
    context = dataset.to_context()
    request = demo_request(context)
    print(
        f"world: {len(dataset.tasks)} tasks, {len(dataset.assets)} assets, "
        f"{len(dataset.corridors)} corridors, {len(dataset.resources)} resources, "
        f"{len(dataset.trains)} train movements, {len(dataset.goods_forecasts)} forecasts"
    )
    print_summary("single-task generate (first task)", run_generate(pipeline, request, context))

    print("\n=== Scenarios A-J ===")
    for scenario in all_scenarios():
        try:
            summary = run_scenario(pipeline, scenario)
            print_summary(f"{scenario.scenario_id}: {scenario.name}", summary)
        except PipelineError as exc:
            print(f"\n== {scenario.scenario_id}: {scenario.name}  -> pipeline error: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())