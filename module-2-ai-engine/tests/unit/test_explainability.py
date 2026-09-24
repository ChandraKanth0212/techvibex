import pytest
from app.schemas.source_data import MaintenanceTaskInput, Department
from app.schemas.ai_output import FactorBreakdown
from app.models.enums import PriorityLevel, RiskLevel
from app.explainability.generator import ExplainabilityGenerator
from app.services.candidate_service import CandidateService
from app.core.config import load_scoring_config

def test_explainability_generator_reason_codes():
    config = load_scoring_config()
    generator = ExplainabilityGenerator(config)
    
    task = MaintenanceTaskInput(
        request_id="REQ-EXP-01",
        department=Department.ENGINEERING,
        asset_id="A11",
        asset_type="RAIL",
        section="SEC_B",
        location="KM20",
        work_type="Repair",
        description="Track repair",
        duration_minutes=90,
        overdue_days=5
    )
    
    factors = FactorBreakdown(
        criticality_score=80.0,
        urgency_score=75.0,
        defect_severity_score=85.0,
        safety_impact_score=80.0,
        failure_risk_score=75.0,
        overdue_factor=1.35,
        train_exposure_score=60.0,
        operational_impact_score=50.0
    )
    
    codes, action, text = generator.generate(task, factors, 88.0, PriorityLevel.CRITICAL, RiskLevel.HIGH)
    assert "HIGH_ASSET_CRITICALITY" in codes
    assert "SAFETY_RELATED_DEFECT" in codes
    assert "OVERDUE_MAINTENANCE" in codes
    assert "CRITICAL_DEFECT_SEVERITY" in codes
    assert "CRITICAL" in text

def test_candidate_service_matching():
    config = load_scoring_config()
    candidate_service = CandidateService(config)
    
    t1 = MaintenanceTaskInput(
        request_id="REQ-CAND-01",
        department=Department.ENGINEERING,
        asset_id="A1",
        asset_type="RAIL",
        section="SECTION_X",
        location="KM100",
        work_type="Packing",
        description="Track packing",
        duration_minutes=60
    )
    
    t2 = MaintenanceTaskInput(
        request_id="REQ-CAND-02",
        department=Department.SIGNALLING,
        asset_id="A2",
        asset_type="SIGNAL",
        section="SECTION_X",
        location="KM100",
        work_type="Inspection",
        description="Signal check",
        duration_minutes=60
    )
    
    resp = candidate_service.find_integration_candidates([t1, t2])
    assert resp.total_candidates_found == 1
    assert resp.groups[0].section == "SECTION_X"
    assert "REQ-CAND-01" in resp.groups[0].request_ids
    assert "REQ-CAND-02" in resp.groups[0].request_ids
