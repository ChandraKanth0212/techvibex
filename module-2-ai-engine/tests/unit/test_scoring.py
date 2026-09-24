import pytest
from app.schemas.source_data import MaintenanceTaskInput, Department, BlockType
from app.scoring.criticality import CriticalityScorer
from app.scoring.urgency import UrgencyScorer
from app.scoring.composite_scorer import CompositeScorer
from app.core.config import load_scoring_config

def test_criticality_scorer_boost():
    scorer = CriticalityScorer()
    task = MaintenanceTaskInput(
        request_id="REQ-001",
        department=Department.ENGINEERING,
        asset_id="A1",
        asset_type="RAIL_FRACTURE",
        section="SEC_A",
        location="KM10",
        work_type="Repair",
        description="Rail fracture",
        duration_minutes=60,
        criticality=50.0
    )
    score = scorer.evaluate(task)
    assert score == 95.0

def test_urgency_scorer_overdue_multiplier():
    scorer = UrgencyScorer(max_multiplier=2.5, scaling_days=14.0)
    task = MaintenanceTaskInput(
        request_id="REQ-002",
        department=Department.SIGNALLING,
        asset_id="A2",
        asset_type="SIGNAL",
        section="SEC_A",
        location="KM12",
        work_type="Check",
        description="Signal check",
        duration_minutes=30,
        urgency=50.0,
        overdue_days=14
    )
    score = scorer.evaluate(task)
    # 50.0 * (1.0 + 14/14) = 50.0 * 2.0 = 100.0
    assert score == 100.0

def test_composite_scorer_priority_critical():
    config = load_scoring_config()
    scorer = CompositeScorer(config)
    task = MaintenanceTaskInput(
        request_id="REQ-003",
        department=Department.ENGINEERING,
        asset_id="A3",
        asset_type="RAIL_FRACTURE",
        section="SEC_A",
        location="KM14",
        work_type="Repair",
        description="Critical track work",
        duration_minutes=120,
        criticality=95.0,
        urgency=90.0,
        defect_severity=90.0,
        overdue_days=14,
        failure_probability=0.8,
        safety_impact=95.0,
        train_exposure=85.0,
        operational_impact=80.0
    )
    score, level, factors = scorer.evaluate(task)
    assert score >= 85.0
    assert level.value == "CRITICAL"
