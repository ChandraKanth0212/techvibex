"""API demo runner (Phase 7B).

Exercises the FastAPI application against the deterministic SYNTHETIC_DEMO
dataset over an in-process TestClient:

- ``GET /health`` -> module + SYNTHETIC_DEMO data mode
- ``POST /api/optimizer/generate`` with ``demo_generate_payload(seed=0)``
- ``GET /api/optimizer/plans/{plan_id}/metrics`` for the generated plan

Run from the ``optimizer`` directory::

    python -m scripts.run_api_demo
    python scripts/run_api_demo.py
"""

from __future__ import annotations

import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from demo_data import SYNTHETIC_DEMO_DISCLAIMER, demo_generate_payload


def main() -> int:
    print(SYNTHETIC_DEMO_DISCLAIMER)
    app = create_app(settings=Settings(demo_mode=True))
    client = TestClient(app)

    health = client.get("/health")
    print(f"GET /health                -> {health.status_code} {health.json()}")

    payload = demo_generate_payload(seed=0)
    response = client.post("/api/optimizer/generate", json=payload)
    if response.status_code != 200:
        print(f"POST /api/optimizer/generate -> {response.status_code} {response.text[:500]}")
        return 1
    body = response.json()
    print(f"POST /api/optimizer/generate -> 200 plan_id={body['plan_id']}")
    print(f"  status={body['solver_status']} scheduled={len(body['schedule']['scheduled_task_ids'])}"
          f" unscheduled={len(body['schedule']['unscheduled_task_ids'])}"
          f" data_mode={body['data_mode']} storage={body['storage']}")
    if body.get("metrics"):
        print(
            f"  coverage={body['metrics']['task_coverage_ratio']}"
            f" integrated_blocks={body['metrics']['integrated_blocks_count']}"
        )

    plan_id = body["plan_id"]
    metrics_response = client.get(f"/api/optimizer/plans/{plan_id}/metrics")
    print(f"GET /api/optimizer/plans/{plan_id}/metrics -> {metrics_response.status_code}")
    if metrics_response.status_code == 200:
        metrics = metrics_response.json()["metrics"]
        print(f"  total_tasks_requested={metrics['total_tasks_requested']}"
              f" total_tasks_scheduled={metrics['total_tasks_scheduled']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())