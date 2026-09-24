import sys
from pathlib import Path

# Add app directory to sys.path
module_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(module_dir))

from app.schemas.source_data import MaintenanceTaskInput, Department
from app.schemas.ai_output import FactorBreakdown
from app.models.enums import PriorityLevel, RiskLevel
from app.scoring.criticality import CriticalityScorer
from app.scoring.urgency import UrgencyScorer
from app.scoring.composite_scorer import CompositeScorer
from app.services.risk_service import RiskService
from app.explainability.generator import ExplainabilityGenerator
from app.services.candidate_service import CandidateService
from app.services.scoring_service import ScoringService
from app.core.config import load_scoring_config

def run_all_tests():
    print("=== RUNNING MODULE 2 TEST VERIFICATION ===")
    
    # Test 1: Criticality Scorer
    c_scorer = CriticalityScorer()
    t1 = MaintenanceTaskInput(
        request_id="REQ-001", department=Department.ENGINEERING, asset_id="A1",
        asset_type="RAIL_FRACTURE", section="SEC_A", location="KM10", work_type="Repair",
        description="Rail fracture", duration_minutes=60, criticality=50.0
    )
    score1 = c_scorer.evaluate(t1)
    assert score1 == 95.0, f"Expected 95.0, got {score1}"
    print("[PASS] Test 1: CriticalityScorer asset boost evaluation")

    # Test 2: Urgency Scorer Overdue Multiplier
    u_scorer = UrgencyScorer(max_multiplier=2.5, scaling_days=14.0)
    t2 = MaintenanceTaskInput(
        request_id="REQ-002", department=Department.SIGNALLING, asset_id="A2",
        asset_type="SIGNAL", section="SEC_A", location="KM12", work_type="Check",
        description="Signal check", duration_minutes=30, urgency=50.0, overdue_days=14
    )
    score2 = u_scorer.evaluate(t2)
    assert score2 == 100.0, f"Expected 100.0, got {score2}"
    print("[PASS] Test 2: UrgencyScorer overdue scaling multiplier")

    # Test 3: Composite Priority Scorer
    config = load_scoring_config()
    comp_scorer = CompositeScorer(config)
    t3 = MaintenanceTaskInput(
        request_id="REQ-003", department=Department.ENGINEERING, asset_id="A3",
        asset_type="RAIL_FRACTURE", section="SEC_A", location="KM14", work_type="Repair",
        description="Critical track work", duration_minutes=120, criticality=95.0,
        urgency=90.0, defect_severity=90.0, overdue_days=14, failure_probability=0.8,
        safety_impact=95.0, train_exposure=85.0, operational_impact=80.0
    )
    score3, level3, factors3 = comp_scorer.evaluate(t3)
    assert score3 >= 85.0, f"Expected >= 85.0, got {score3}"
    assert level3 == PriorityLevel.CRITICAL, f"Expected CRITICAL, got {level3}"
    print(f"[PASS] Test 3: CompositeScorer evaluation (Score: {score3}, Level: {level3.value})")

    # Test 4: Risk Service Assessment
    risk_service = RiskService(config)
    r_score, r_level = risk_service.evaluate_risk(t3, factors3)
    assert r_score >= 80.0, f"Expected >= 80.0, got {r_score}"
    assert r_level == RiskLevel.EXTREME, f"Expected EXTREME, got {r_level}"
    print(f"[PASS] Test 4: RiskService evaluation (Risk Score: {r_score}, Level: {r_level.value})")

    # Test 5: Explainability Generator
    generator = ExplainabilityGenerator(config)
    codes, action, text = generator.generate(t3, factors3, score3, level3, r_level)
    assert "HIGH_ASSET_CRITICALITY" in codes
    assert "SAFETY_RELATED_DEFECT" in codes
    assert "OVERDUE_MAINTENANCE" in codes
    print(f"[PASS] Test 5: ExplainabilityGenerator reason codes: {codes}")

    # Test 6: Candidate Service Spatial-Temporal Matching
    t4 = MaintenanceTaskInput(
        request_id="REQ-004", department=Department.SIGNALLING, asset_id="A4",
        asset_type="POINT_SWITCH", section="SEC_A", location="KM14", work_type="Check",
        description="Signal check", duration_minutes=60
    )
    cand_service = CandidateService(config)
    resp = cand_service.find_integration_candidates([t3, t4])
    assert resp.total_candidates_found == 1
    assert "REQ-003" in resp.groups[0].request_ids
    assert "REQ-004" in resp.groups[0].request_ids
    print(f"[PASS] Test 6: CandidateService multi-department match: Group {resp.groups[0].group_id}")

    # Test 7: End-to-End ScoringService Pipeline
    service = ScoringService()
    rec = service.evaluate_task(t3)
    assert rec.request_id == "REQ-003"
    assert rec.priority_level == PriorityLevel.CRITICAL
    assert rec.risk_level == RiskLevel.EXTREME
    print("[PASS] Test 7: Full ScoringService End-to-End pipeline execution")

    print("\nALL 7 VERIFICATION TESTS PASSED SUCCESSFULLY! 100% SUCCESS.")

if __name__ == "__main__":
    run_all_tests()
