"""Configuration for the optimization engine.

Central place for tunable parameters. Values can be overridden through
environment variables prefixed with ``RAILOPT_``. Nothing is hard-coded in the
service layer.
"""

import os
from functools import lru_cache

from pydantic import BaseModel, Field

from app.models import DataMode


class ObjectiveWeights(BaseModel):
    """Weights used by the CP-SAT objective (Phase 2+).

    Phase 3B adds ``task_completion`` and ``overdue_reduction``; both are needed
    to express the scheduling directive set in Phase 2 (schedule as many tasks as
    possible / prioritise overdue work) and are deterministic.
    """

    slot_consolidation: float = Field(default=1.0, ge=0.0)
    priority_adherence: float = Field(default=1.0, ge=0.0)
    forecast_alignment: float = Field(default=1.0, ge=0.0)
    resource_efficiency: float = Field(default=1.0, ge=0.0)
    task_completion: float = Field(default=1.0, ge=0.0)
    overdue_reduction: float = Field(default=1.0, ge=0.0)


class Settings(BaseModel):
    app_name: str = "optimization-engine"
    safety_buffer_minutes: int = Field(default=15, ge=0)
    goods_forecast_probability_threshold: float = Field(default=0.60, ge=0.0, le=1.0)
    goods_forecast_peak_threshold: float = Field(default=0.85, ge=0.0, le=1.0)
    solver_timeout_seconds: int = Field(default=30, gt=0)
    planning_horizon_days: int = Field(default=7, gt=0)
    candidate_step_minutes: int = Field(default=30, ge=1)
    max_candidates_per_task: int = Field(default=50, ge=1)
    max_integrated_group_size: int = Field(default=5, ge=2)
    max_integrated_groups: int = Field(default=200, ge=1)
    max_placements_per_group: int = Field(default=1000, ge=1)
    objective_weights: ObjectiveWeights = Field(default_factory=ObjectiveWeights)
    demo_mode: bool = True

    @property
    def data_mode(self) -> DataMode:
        """Execution mode derived from ``demo_mode``."""
        return DataMode.SYNTHETIC_DEMO if self.demo_mode else DataMode.PRODUCTION

    @classmethod
    def from_env(cls) -> "Settings":
        """Build Settings from ``RAILOPT_*`` environment variables."""
        prefix = "RAILOPT_"
        env = {key[len(prefix):]: value for key, value in os.environ.items() if key.startswith(prefix)}
        if not env:
            return cls()

        kwargs: dict = {}
        bools = {"DEMO_MODE": "demo_mode"}
        ints = {
            "SAFETY_BUFFER_MINUTES": "safety_buffer_minutes",
            "SOLVER_TIMEOUT_SECONDS": "solver_timeout_seconds",
            "PLANNING_HORIZON_DAYS": "planning_horizon_days",
            "CANDIDATE_STEP_MINUTES": "candidate_step_minutes",
            "MAX_CANDIDATES_PER_TASK": "max_candidates_per_task",
            "MAX_INTEGRATED_GROUP_SIZE": "max_integrated_group_size",
            "MAX_INTEGRATED_GROUPS": "max_integrated_groups",
            "MAX_PLACEMENTS_PER_GROUP": "max_placements_per_group",
        }
        floats = {
            "GOODS_FORECAST_PROBABILITY_THRESHOLD": "goods_forecast_probability_threshold",
            "GOODS_FORECAST_PEAK_THRESHOLD": "goods_forecast_peak_threshold",
        }

        for raw, field in bools.items():
            if raw in env:
                kwargs[field] = _to_bool(env[raw])
        for raw, field in ints.items():
            if raw in env:
                kwargs[field] = int(env[raw])
        for raw, field in floats.items():
            if raw in env:
                kwargs[field] = float(env[raw])
        return cls(**kwargs)


def _to_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Singleton settings; cached for the process lifetime."""
    return Settings.from_env()


def reload_settings() -> None:
    """Clear the cached singleton (used mainly by tests)."""
    get_settings.cache_clear()


__all__ = ["ObjectiveWeights", "Settings", "get_settings", "reload_settings"]