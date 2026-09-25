"""PlanningContext: typed snapshot of the dynamic world state used by engines.

The Phase 1 service interfaces take ``context: dict``. This module defines the
canonical schema for that dict so business logic never scrapes raw dictionaries
and optional data simply arrives as empty lists (nothing is invented).

Context keys (pydantic field names):

- ``horizon_start`` / ``horizon_end``: planning window boundaries (``datetime``)
- ``tasks``: list of :class:`MaintenanceTask`
- ``block_requests``: list of :class:`BlockRequest`
- ``corridors``: list of :class:`Corridor`
- ``existing_blocks``: list of :class:`ExistingBlock`
- ``train_movements``: list of :class:`TrainMovement`
- ``goods_forecasts``: list of :class:`GoodsForecast`
- ``resources``: list of :class:`Resource`
- ``assets``: list of :class:`Asset`
- ``defects``: list of :class:`Defect`
- ``priorities``: list of :class:`AIRecommendation` (Module 2 output)

Configuration (safety buffer, goods thresholds, horizons, solver settings)
deliberately does NOT live here: engines read it from
:class:`app.core.config.Settings` so tunables stay centralised.
"""

from datetime import datetime

from pydantic import BaseModel, Field

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


class PlanningContext(BaseModel):
    """Typed view over a raw context dict supplied to the service layer."""

    horizon_start: datetime | None = None
    horizon_end: datetime | None = None
    tasks: list[MaintenanceTask] = Field(default_factory=list)
    block_requests: list[BlockRequest] = Field(default_factory=list)
    corridors: list[Corridor] = Field(default_factory=list)
    existing_blocks: list[ExistingBlock] = Field(default_factory=list)
    train_movements: list[TrainMovement] = Field(default_factory=list)
    goods_forecasts: list[GoodsForecast] = Field(default_factory=list)
    resources: list[Resource] = Field(default_factory=list)
    assets: list[Asset] = Field(default_factory=list)
    defects: list[Defect] = Field(default_factory=list)
    priorities: list[AIRecommendation] = Field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: dict | None) -> "PlanningContext":
        """Build a context from a raw dict.

        Unknown keys are ignored so callers may pass extra annotations; missing
        keys become empty lists / ``None`` (no fabricated world data).
        """
        raw = raw or {}
        known = {key: raw[key] for key in cls.model_fields if key in raw}
        return cls(**known)


__all__ = ["PlanningContext"]