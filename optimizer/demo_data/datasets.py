"""Demo dataset facade: deterministic container + context/payload helpers.

``DemoDataset`` bundles every generated catalogue (single seed, pure functions)
and exposes a ready-made :class:`PlanningContext` plus API payload helpers. All
content is SYNTHETIC_DEMO and deterministic: the same ``seed`` always yields the
same catalogue, context, request and payload.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.core.config import Settings
from app.core.context import PlanningContext
from contracts import (
    AIRecommendation,
    Asset,
    BlockRequest,
    Corridor,
    Defect,
    ExistingBlock,
    GoodsForecast,
    MaintenanceTask,
    Resource,
    TrainMovement,
)

from .constants import (
    DEMO_HORIZON_DAYS,
    DEMO_HORIZON_END,
    DEMO_HORIZON_START,
    SYNTHETIC_DEMO,
)
from .generator import (
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


@dataclass
class DemoDataset:
    """Deterministic synthetic demo snapshot (links all inner generators).

    Attributes
    ----------
    - ``seed``: public determinism seed
    - ``corridors`` / ``assets`` / ``defects`` / ``tasks`` / ``resources`` /
      ``block_requests`` / ``trains`` / ``goods_forecasts`` / ``existing_blocks``
      / ``priorities``: the generated catalogues
    - ``horizon_start`` / ``horizon_end``: fixed demo planning horizon
    """

    seed: int
    corridors: list[Corridor]
    assets: list[Asset]
    defects: list[Defect]
    tasks: list[MaintenanceTask]
    resources: list[Resource]
    block_requests: list[BlockRequest]
    trains: list[TrainMovement]
    goods_forecasts: list[GoodsForecast]
    existing_blocks: list[ExistingBlock]
    priorities: list[AIRecommendation] = field(default_factory=list)
    horizon_start: datetime = DEMO_HORIZON_START
    horizon_end: datetime = DEMO_HORIZON_END

    # ------------------------------------------------------------------- build

    @classmethod
    def build(cls, seed: int = 0) -> "DemoDataset":
        """Build every catalogue from ``seed`` (each a pure function of it)."""
        return cls(
            seed=seed,
            corridors=create_demo_corridors(seed),
            assets=create_demo_assets(seed),
            defects=create_demo_defects(seed),
            tasks=create_demo_tasks(seed),
            resources=create_demo_resources(seed),
            block_requests=create_demo_block_requests(seed),
            trains=create_demo_trains(seed),
            goods_forecasts=create_demo_goods_forecasts(seed),
            existing_blocks=create_demo_existing_blocks(seed),
            priorities=create_demo_priorities(seed),
        )

    # ------------------------------------------------------------ context / api

    def to_context(self) -> PlanningContext:
        """A ready-to-consume :class:`PlanningContext` for the pipeline/API."""
        return PlanningContext(
            horizon_start=self.horizon_start,
            horizon_end=self.horizon_end,
            tasks=self.tasks,
            block_requests=self.block_requests,
            corridors=self.corridors,
            existing_blocks=self.existing_blocks,
            train_movements=self.trains,
            goods_forecasts=self.goods_forecasts,
            resources=self.resources,
            assets=self.assets,
            defects=self.defects,
            priorities=self.priorities,
        )

    def to_payload_catalog(self) -> dict:
        """JSON-mode catalogue (header + all collections) for serialisation."""
        return {
            "catalog_type": SYNTHETIC_DEMO,
            "seed": self.seed,
            "horizon_start": self.horizon_start.isoformat(),
            "horizon_end": self.horizon_end.isoformat(),
            "corridors": [corridor.model_dump(mode="json") for corridor in self.corridors],
            "assets": [asset.model_dump(mode="json") for asset in self.assets],
            "defects": [defect.model_dump(mode="json") for defect in self.defects],
            "tasks": [task.model_dump(mode="json") for task in self.tasks],
            "resources": [resource.model_dump(mode="json") for resource in self.resources],
            "block_requests": [
                request.model_dump(mode="json") for request in self.block_requests
            ],
            "trains": [train.model_dump(mode="json") for train in self.trains],
            "goods_forecasts": [
                forecast.model_dump(mode="json") for forecast in self.goods_forecasts
            ],
            "existing_blocks": [
                block.model_dump(mode="json") for block in self.existing_blocks
            ],
            "priorities": [
                priority.model_dump(mode="json") for priority in self.priorities
            ],
        }

    def first_request(self) -> BlockRequest:
        """The catalogue block request (also its first task's request)."""
        return self.block_requests[0]

    # -------------------------------------------------------------- module api

    def demo_request(self, context: PlanningContext | None = None) -> BlockRequest:
        """A single-task optimisation request scoped to the first task."""
        return _scope_request(self.tasks[0], self.block_requests)

    def demo_generate_payload(
        self,
        context: PlanningContext | None = None,
        settings: Settings | None = None,
    ) -> dict:
        """A request body for ``POST /api/optimizer/generate``.

        The body carries an explicit single-task ``request`` plus the full demo
        context so the pipeline registers exactly that request into the world.
        """
        ctx = context or self.to_context()
        from app.schemas.optimizer import ModelSettings  # lazy: settings import

        model_settings = _as_model_settings(settings)
        return {
            "request": self.demo_request(ctx).model_dump(mode="json"),
            "context": ctx.model_dump(mode="json"),
            "settings": model_settings.model_dump(mode="json"),
        }


# ---------------------------------------------------------------------- helpers

def create_demo_context(seed: int = 0) -> PlanningContext:
    """Shortcut: build a :class:`PlanningContext` for demo ``seed``."""
    return DemoDataset.build(seed).to_context()


def demo_request(context: PlanningContext) -> BlockRequest:
    """Single-task optimisation request scoped to the first task in ``context``.

    The task-level window wins over the block request window (per pipeline
    semantics) so this yields a deterministic, schedulable scope.
    """
    tasks = sorted(context.tasks, key=lambda task: task.task_id)
    if not tasks:
        raise ValueError("context has no tasks; cannot build a demo request")
    task = tasks[0]
    return _scope_request(task, context.block_requests)


def _scope_request(task: MaintenanceTask, block_requests: list[BlockRequest]) -> BlockRequest:
    matching = [req for req in block_requests if task.task_id in req.task_ids]
    if matching:
        return matching[0]
    return BlockRequest(
        request_id=f"BRQ-{task.task_id}",
        task_ids=[task.task_id],
        corridor_id=task.corridor_id,
        section=task.metadata.get("section") or task.corridor_id,
        requested_start=task.window_start,
        requested_end=task.window_end,
        notes="SYNTHETIC_DEMO block request",
    )


def demo_generate_payload(
    seed: int = 0,
    context: PlanningContext | None = None,
    settings: Settings | None = None,
) -> dict:
    """Standalone builder of an API generate payload for demo ``seed``."""
    dataset = DemoDataset.build(seed)
    return dataset.demo_generate_payload(
        context=context or dataset.to_context(), settings=settings
    )


def _as_model_settings(settings: Settings | None):
    """Fold a Settings into a per-request ModelSettings; defaults otherwise."""
    from app.schemas.optimizer import ModelObjectiveWeights, ModelSettings

    if settings is None:
        return ModelSettings()
    return ModelSettings(
        safety_buffer_minutes=settings.safety_buffer_minutes,
        goods_forecast_probability_threshold=settings.goods_forecast_probability_threshold,
        goods_forecast_peak_threshold=settings.goods_forecast_peak_threshold,
        solver_timeout_seconds=settings.solver_timeout_seconds,
        planning_horizon_days=settings.planning_horizon_days,
        candidate_step_minutes=settings.candidate_step_minutes,
        max_candidates_per_task=settings.max_candidates_per_task,
        max_integrated_group_size=settings.max_integrated_group_size,
        max_integrated_groups=settings.max_integrated_groups,
        max_placements_per_group=settings.max_placements_per_group,
        objective_weights=ModelObjectiveWeights(
            **settings.objective_weights.model_dump()
        ),
    )


def demo_settings() -> Settings:
    """Demo-flavoured settings (SYNTHETIC_DEMO mode, default tunables)."""
    return Settings(demo_mode=True)


__all__ = [
    "DEMO_HORIZON_DAYS",
    "DemoDataset",
    "create_demo_context",
    "demo_generate_payload",
    "demo_request",
    "demo_settings",
]