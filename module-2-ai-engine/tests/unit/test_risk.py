import pytest
from app.schemas.source_data import MaintenanceTaskInput, Department
from app.schemas.ai_output import FactorBreakdown
from app.services.risk_service import RiskService
from app.core.config import load_scoring_config

def test_risk_service_extreme_risk():
    config = load_scoring_config()
    risk_service = RiskService(config)
    
    task = MaintenanceTaskInput(
        request_id="REQ-RISK-01",
        department=Department.ENGINEERING,
        asset_id="A10",
        asset_type="BRIDGE",
        section="SEC_A",
        location="KM50",
        work_type="Repair",
        description="High risk bridge fault",
        duration_minutes=180,
        failure_probability=0.9
    )
    
    factors = FactorBreakdown(
        criticality_score=95.0,
        urgency_score=90.0,
        defect_severity_score=90.0,
        safety_impact_score=95.0,
        failure_risk_score=90.0,
        overdue_factor=2.0,
        train_exposure_score=90.0,
        operational_impact_score=85.0
    )
    
    score, level = risk_service.evaluate_risk(task, factors)
    assert score >= 80.0
    assert level.value == "EXTREME"
