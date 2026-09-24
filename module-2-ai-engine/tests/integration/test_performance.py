import time
import json
from pathlib import Path
from app.adapters.module1_adapter import Module1InputAdapter
from app.services.scoring_service import ScoringService

def test_performance_batch_benchmark():
    data_path = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic_demo_tasks.json"
    with open(data_path, "r", encoding="utf-8") as f:
        raw_tasks = json.load(f)

    # Measure adapter transformation time
    t0 = time.perf_counter()
    canonical_tasks = Module1InputAdapter.adapt_batch_payload(raw_tasks)
    adapter_duration_ms = (time.perf_counter() - t0) * 1000.0

    # Measure scoring & candidate engine evaluation time
    service = ScoringService()
    t1 = time.perf_counter()
    recommendations = service.evaluate_batch(canonical_tasks)
    eval_duration_ms = (time.perf_counter() - t1) * 1000.0

    assert len(recommendations) >= 14
    assert adapter_duration_ms < 50.0, f"Adapter too slow: {adapter_duration_ms:.2f} ms"
    assert eval_duration_ms < 100.0, f"Evaluation too slow: {eval_duration_ms:.2f} ms"
    print(f"\n[PERFORMANCE BENCHMARK] {len(recommendations)} Tasks -> Adapter: {adapter_duration_ms:.2f} ms, Evaluation + Candidate Matching: {eval_duration_ms:.2f} ms")
