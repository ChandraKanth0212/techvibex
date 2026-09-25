"""Synthetic demo dataset for the RailOpt optimization engine (Phase 7B).

Everything in this package is SYNTHETIC_DEMO ONLY: deterministic, fabricated
data shaped like railway maintenance planning inputs. It is never claimed to be
live Indian Railways data (see :data:`constants.SYNTHETIC_DEMO_DISCLAIMER`).

Contents:

- ``generator``: pure, seed-deterministic factories for every catalogue
  (corridors, assets, defects, tasks, resources, block requests, train
  movements, goods forecasts, existing blocks, Module 2 priorities).
- ``datasets``: the :class:`DemoDataset` facade plus ready-made
  :class:`PlanningContext` and API ``POST /api/optimizer/generate`` payloads.
- ``scenarios``: self-contained deterministic worlds (A-J) that train specific
  pipeline properties (integration, conflicts, unsupported codes, fixtures).
- ``constants``: departments, horizon, scale and disclaimer strings.

The package depends only on ``contracts`` and the stdlib (+ ``app`` types for
default values); no pipeline/solver logic lives here (that lives in scripts and
the app service layer).
"""

from .constants import (
    ALL_DEPARTMENTS,
    DATASET_SCALE,
    DEMO_GENERATED_AT,
    DEMO_HORIZON_DAYS,
    DEMO_HORIZON_END,
    DEMO_HORIZON_START,
    SYNTHETIC_DEMO,
    SYNTHETIC_DEMO_DISCLAIMER,
)
from .datasets import (
    DemoDataset,
    create_demo_context,
    demo_generate_payload,
    demo_request,
)
from .generator import (
    URGENT_TASK_INDICES,
    create_demo_assets,
    create_demo_block_requests,
    create_demo_corridors,
    create_demo_defects,
    create_demo_existing_blocks,
    create_demo_goods_forecasts,
    create_demo_priorities,
    create_demo_resources,
    create_demo_tasks,
    create_demo_trains,
)
from .scenarios import (
    SCENARIO_IDS,
    DemoScenario,
    all_scenarios,
    get_scenario,
)

__version__ = "0.1.0"

__all__ = [
    "ALL_DEPARTMENTS",
    "DATASET_SCALE",
    "DEMO_GENERATED_AT",
    "DEMO_HORIZON_DAYS",
    "DEMO_HORIZON_END",
    "DEMO_HORIZON_START",
    "SYNTHETIC_DEMO",
    "SYNTHETIC_DEMO_DISCLAIMER",
    "URGENT_TASK_INDICES",
    "DemoDataset",
    "DemoScenario",
    "SCENARIO_IDS",
    "all_scenarios",
    "create_demo_assets",
    "create_demo_block_requests",
    "create_demo_context",
    "create_demo_corridors",
    "create_demo_defects",
    "create_demo_existing_blocks",
    "create_demo_goods_forecasts",
    "create_demo_priorities",
    "create_demo_resources",
    "create_demo_tasks",
    "create_demo_trains",
    "demo_generate_payload",
    "demo_request",
    "get_scenario",
]