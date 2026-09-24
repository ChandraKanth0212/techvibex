import time
from app.schemas.source_data import MaintenanceTaskInput
from app.models.enums import Department
from app.services.scoring_service import ScoringService

def generate_task_batch(count: int) -> list[MaintenanceTaskInput]:
    departments = [Department.ENGINEERING, Department.SIGNALLING, Department.TRACTION]
    sections = ["SECTION_A_B", "SECTION_B_C", "SECTION_C_D"]
    asset_types = ["RAIL_FRACTURE", "POINT_SWITCH", "OHE_CATENARY"]

    tasks = []
    for i in range(count):
        tasks.append(
            MaintenanceTaskInput(
                request_id=f"REQ-PERF-{i:04d}",
                department=departments[i % 3],
                asset_id=f"ASSET-{i:04d}",
                asset_type=asset_types[i % 3],
                section=sections[i % 3],
                location=f"KM_{i}/00",
                work_type="Maintenance Task",
                description=f"Performance benchmark task #{i}",
                duration_minutes=60 + (i % 120),
                criticality=float(20 + (i * 7) % 80),
                urgency=float(30 + (i * 11) % 70),
                defect_severity=float((i * 13) % 90),
                overdue_days=i % 15,
                failure_probability=min(0.99, max(0.01, round((i * 0.07) % 1.0, 2))),
                safety_impact=float(40 + (i * 3) % 60),
                train_exposure=float(30 + (i * 5) % 70),
                operational_impact=float(25 + (i * 9) % 75)
            )
        )
    return tasks

def test_performance_scaling_10_100_500():
    service = ScoringService()
    
    # Benchmark 10 tasks
    tasks_10 = generate_task_batch(10)
    t0 = time.perf_counter()
    recs_10 = service.evaluate_batch(tasks_10)
    duration_10_ms = (time.perf_counter() - t0) * 1000.0

    # Benchmark 100 tasks
    tasks_100 = generate_task_batch(100)
    t1 = time.perf_counter()
    recs_100 = service.evaluate_batch(tasks_100)
    duration_100_ms = (time.perf_counter() - t1) * 1000.0

    # Benchmark 500 tasks
    tasks_500 = generate_task_batch(500)
    t2 = time.perf_counter()
    recs_500 = service.evaluate_batch(tasks_500)
    duration_500_ms = (time.perf_counter() - t2) * 1000.0

    assert len(recs_10) == 10
    assert len(recs_100) == 100
    assert len(recs_500) == 500

    print(f"\n[PERFORMANCE SCALE BENCHMARK]")
    print(f"10 Tasks  : {duration_10_ms:.2f} ms")
    print(f"100 Tasks : {duration_100_ms:.2f} ms")
    print(f"500 Tasks : {duration_500_ms:.2f} ms")

    # Assert sub-second performance for 500 tasks
    assert duration_500_ms < 1000.0, f"500 task evaluation took too long: {duration_500_ms:.2f} ms"
