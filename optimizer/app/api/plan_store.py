"""In-memory demo plan store (Phase 7A).

The store is explicitly ``SYNTHETIC_DEMO / IN_MEMORY``:

- plans exist only for the lifetime of the owning FastAPI application /
  Python process and are **lost on restart**;
- no database or disk persistence is introduced in this phase;
- it is thread-safe so sync routes (FastAPI threadpool) can share it;
- plan IDs are deterministic (derived from the request payload), so an
  identical request maps to the same plan ID within one process lifetime.
"""

from __future__ import annotations

import threading
from typing import Dict, List, Optional

from app.schemas.optimizer import PlanResponse


class InMemoryPlanStore:
    """Demands ``put``/``get`` with deterministic string plan IDs."""

    def __init__(self) -> None:
        self._plans: Dict[str, PlanResponse] = {}
        self._lock = threading.RLock()

    @property
    def storage_kind(self) -> str:
        return "IN_MEMORY"

    def put(self, plan: PlanResponse) -> None:
        with self._lock:
            self._plans[plan.plan_id] = plan

    def get(self, plan_id: str) -> Optional[PlanResponse]:
        with self._lock:
            return self._plans.get(plan_id)

    def ids(self) -> List[str]:
        with self._lock:
            return sorted(self._plans)

    def __len__(self) -> int:
        with self._lock:
            return len(self._plans)


__all__ = ["InMemoryPlanStore"]