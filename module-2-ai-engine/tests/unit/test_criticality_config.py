import pytest
from app.schemas.source_data import MaintenanceTaskInput, Department
from app.scoring.criticality import CriticalityScorer
from app.core.config import load_scoring_config

def test_criticality_scorer_configured_boosts():
    config = {
        "asset_type_boosts": {
            "RAIL_FRACTURE": 98.0,
            "CUSTOM_ASSET": 70.0
        }
    }
    scorer = CriticalityScorer(config)
    
    t1 = MaintenanceTaskInput(
        request_id="REQ-TEST-01", department=Department.ENGINEERING, asset_id="A1",
        asset_type="RAIL_FRACTURE", section="SEC_A", location="KM10", work_type="Repair",
        description="Rail fracture", duration_minutes=60, criticality=50.0
    )
    # Configured boost is 98.0
    assert scorer.evaluate(t1) == 98.0

def test_criticality_scorer_config_change_changes_result():
    config_default = load_scoring_config()
    scorer1 = CriticalityScorer(config_default)
    
    config_custom = {
        "asset_type_boosts": {
            "RAIL_FRACTURE": 60.0  # Changed from 95.0 to 60.0
        }
    }
    scorer2 = CriticalityScorer(config_custom)
    
    t1 = MaintenanceTaskInput(
        request_id="REQ-TEST-02", department=Department.ENGINEERING, asset_id="A1",
        asset_type="RAIL_FRACTURE", section="SEC_A", location="KM10", work_type="Repair",
        description="Rail fracture", duration_minutes=60, criticality=50.0
    )
    score1 = scorer1.evaluate(t1)
    score2 = scorer2.evaluate(t1)
    assert score1 == 95.0
    assert score2 == 60.0
    assert score1 != score2

def test_criticality_scorer_bounded_range():
    config = {
        "asset_type_boosts": {
            "OVERFLOW_ASSET": 150.0  # Intentionally excessive
        }
    }
    scorer = CriticalityScorer(config)
    t = MaintenanceTaskInput(
        request_id="REQ-TEST-03", department=Department.ENGINEERING, asset_id="A1",
        asset_type="OVERFLOW_ASSET", section="SEC_A", location="KM10", work_type="Repair",
        description="Excessive asset score", duration_minutes=60, criticality=50.0
    )
    score = scorer.evaluate(t)
    assert score <= 100.0
    assert score == 100.0
