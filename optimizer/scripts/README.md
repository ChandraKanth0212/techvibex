# Scripts

Executable helpers for the optimization engine (Phase 7B demo mode).

Run from the `optimizer` directory so `app`, `contracts` and `demo_data` are
importable:

```powershell
python -m scripts.run_demo
python -m scripts.run_api_demo
```

Projection (`python scripts/run_demo.py`) also works: both scripts bootstrap the
repository `optimizer/` directory onto `sys.path` themselves.

## `run_demo.py`

End-to-end demo harness:

1. builds the deterministic `SYNTHETIC_DEMO` dataset (`DemoDataset.build(0)`);
2. runs the full Module 3 pipeline for a single-task request
   (candidate generation -> integrated-block detection -> CP-SAT optimization ->
   independent validation -> metrics -> explanations);
3. runs every scenario A–J through the same pipeline and prints a compact table
   (solver status, scheduled/unscheduled, coverage, integrated blocks,
   validation, rejection-code counts).

Scenario A (and J) is executed with `objective_weights.slot_consolidation = 2.0`
so the integrated block is deterministically selected over the tied `sum of
single blocks` objective at default weights.

## `run_api_demo.py`

Drives the FastAPI application over an in-process `TestClient`:

- `GET /health`        -> module + `SYNTHETIC_DEMO` data mode
- `POST /api/optimizer/generate` with `demo_generate_payload(seed=0)`
- `GET /api/optimizer/plans/{plan_id}/metrics`

Everything used is deterministic; the `data_mode` reported is `SYNTHETIC_DEMO`
and storage is `IN_MEMORY` (plans are process-lifetime only).

## Notes

- Both scripts print `SYNTHETIC_DEMO_DISCLAIMER` and never present the data as
  live Indian Railways data.
- Metrics are computed from pipeline outputs; nothing is fabricated.
- Replanning / dynamic scenarios (I) are data fixtures only in this phase.