import pytest
from datetime import datetime, timedelta
from app.schemas.source_data import MaintenanceTaskInput
from app.models.enums import Department, PriorityLevel, RiskLevel
from app.services.scoring_service import ScoringService
from app.services.candidate_service import CandidateService
from app.explainability.reason_codes import ReasonCodes

def create_base_task(**kwargs) -> MaintenanceTaskInput:
    defaults = {
        "request_id": "REQ-PROP-TEST-001",
        "department": Department.ENGINEERING,
        "asset_id": "RAIL-101",
        "asset_type": "RAIL_FRACTURE",
        "section": "SECTION_PROP_A",
        "location": "KM_100/00",
        "work_type": "Track Fix",
        "description": "Property test task",
        "duration_minutes": 60,
        "criticality": 50.0,
        "urgency": 50.0,
        "defect_severity": 50.0,
        "overdue_days": 0,
        "failure_probability": 0.05,
        "safety_impact": 50.0,
        "train_exposure": 50.0,
        "operational_impact": 50.0
    }
    defaults.update(kwargs)
    return MaintenanceTaskInput(**defaults)

# 1. BOUNDS VERIFICATION
def test_property_scores_always_bounded_0_to_100():
    service = ScoringService()
    test_values = [0.0, 1.0, 50.0, 99.9, 100.0]
    
    for val in test_values:
        task = create_base_task(
            criticality=val,
            urgency=val,
            defect_severity=val,
            safety_impact=val,
            train_exposure=val,
            operational_impact=val,
            failure_probability=val / 100.0
        )
        rec = service.evaluate_task(task)
        assert 0.0 <= rec.priority_score <= 100.0
        assert 0.0 <= rec.risk_score <= 100.0
        assert 0.0 <= rec.factors.criticality_score <= 100.0
        assert 0.0 <= rec.factors.urgency_score <= 100.0
        assert 0.0 <= rec.factors.defect_severity_score <= 100.0
        assert 0.0 <= rec.factors.safety_impact_score <= 100.0
        assert 0.0 <= rec.factors.failure_risk_score <= 100.0
        assert 0.0 <= rec.factors.train_exposure_score <= 100.0
        assert 0.0 <= rec.factors.operational_impact_score <= 100.0

# 2. MONOTONICITY VERIFICATION
def test_monotonicity_criticality():
    service = ScoringService()
    low_task = create_base_task(asset_type="STANDARD_TRACK", criticality=10.0)
    high_task = create_base_task(asset_type="STANDARD_TRACK", criticality=90.0)
    assert service.evaluate_task(high_task).priority_score >= service.evaluate_task(low_task).priority_score

def test_monotonicity_urgency():
    service = ScoringService()
    low_task = create_base_task(urgency=10.0)
    high_task = create_base_task(urgency=90.0)
    assert service.evaluate_task(high_task).priority_score >= service.evaluate_task(low_task).priority_score

def test_monotonicity_defect_severity():
    service = ScoringService()
    low_task = create_base_task(defect_severity=10.0)
    high_task = create_base_task(defect_severity=90.0)
    assert service.evaluate_task(high_task).priority_score >= service.evaluate_task(low_task).priority_score

def test_monotonicity_failure_probability():
    service = ScoringService()
    low_task = create_base_task(failure_probability=0.01)
    high_task = create_base_task(failure_probability=0.99)
    low_rec = service.evaluate_task(low_task)
    high_rec = service.evaluate_task(high_task)
    assert high_rec.priority_score >= low_rec.priority_score
    assert high_rec.risk_score >= low_rec.risk_score

def test_monotonicity_safety_impact():
    service = ScoringService()
    low_task = create_base_task(safety_impact=10.0)
    high_task = create_base_task(safety_impact=90.0)
    low_rec = service.evaluate_task(low_task)
    high_rec = service.evaluate_task(high_task)
    assert high_rec.priority_score >= low_rec.priority_score
    assert high_rec.risk_score >= low_rec.risk_score

def test_monotonicity_overdue_days():
    service = ScoringService()
    low_task = create_base_task(overdue_days=0)
    high_task = create_base_task(overdue_days=10)
    low_rec = service.evaluate_task(low_task)
    high_rec = service.evaluate_task(high_task)
    assert high_rec.factors.urgency_score >= low_rec.factors.urgency_score
    assert high_rec.priority_score >= low_rec.priority_score

# 3. EXPLAINABILITY FALSE-REASON GUARDING
def test_explainability_no_false_reasons():
    service = ScoringService()
    task = create_base_task(
        asset_type="STANDARD_TRACK",  # Unboosted asset type
        criticality=20.0,
        urgency=20.0,
        defect_severity=10.0,
        overdue_days=0,
        failure_probability=0.01,
        safety_impact=10.0,
        train_exposure=10.0,
        operational_impact=10.0
    )
    rec = service.evaluate_task(task)
    assert ReasonCodes.OVERDUE_MAINTENANCE not in rec.reason_codes
    assert ReasonCodes.HEAVY_TRAIN_EXPOSURE not in rec.reason_codes
    assert ReasonCodes.SAFETY_RELATED_DEFECT not in rec.reason_codes
    assert ReasonCodes.CRITICAL_DEFECT_SEVERITY not in rec.reason_codes
    assert ReasonCodes.HIGH_ASSET_CRITICALITY not in rec.reason_codes
    assert ReasonCodes.HIGH_FAILURE_RISK not in rec.reason_codes
    assert ReasonCodes.SEVERE_OPERATIONAL_IMPACT not in rec.reason_codes
    assert ReasonCodes.ROUTINE_MAINTENANCE in rec.reason_codes

def test_explainability_overdue_reason_triggered_only_when_overdue():
    service = ScoringService()
    zero_overdue_task = create_base_task(overdue_days=0)
    overdue_task = create_base_task(overdue_days=5)
    
    rec_zero = service.evaluate_task(zero_overdue_task)
    rec_overdue = service.evaluate_task(overdue_task)
    
    assert ReasonCodes.OVERDUE_MAINTENANCE not in rec_zero.reason_codes
    assert ReasonCodes.OVERDUE_MAINTENANCE in rec_overdue.reason_codes

# 4. CANDIDATE MATCHING PROXIMITY & BOUNDARY TESTS
def test_candidate_matching_temporal_boundaries():
    now = datetime.utcnow()
    cand_service = CandidateService()

    # 4a. Overlapping windows (0 min gap) -> Candidate
    t1 = create_base_task(
        request_id="T1", department=Department.ENGINEERING, section="SEC_X",
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t2 = create_base_task(
        request_id="T2", department=Department.SIGNALLING, section="SEC_X",
        preferred_start=now + timedelta(hours=1), preferred_end=now + timedelta(hours=3)
    )
    res_overlap = cand_service.find_integration_candidates([t1, t2])
    assert res_overlap.total_candidates_found == 1

    # 4b. 30 min gap (within 60 min threshold) -> Candidate
    t3 = create_base_task(
        request_id="T3", department=Department.ENGINEERING, section="SEC_Y",
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t4 = create_base_task(
        request_id="T4", department=Department.TRACTION, section="SEC_Y",
        preferred_start=now + timedelta(hours=2, minutes=30), preferred_end=now + timedelta(hours=4)
    )
    res_30m = cand_service.find_integration_candidates([t3, t4])
    assert res_30m.total_candidates_found == 1

    # 4c. Exactly 60 min gap -> Candidate
    t5 = create_base_task(
        request_id="T5", department=Department.ENGINEERING, section="SEC_Z",
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t6 = create_base_task(
        request_id="T6", department=Department.SIGNALLING, section="SEC_Z",
        preferred_start=now + timedelta(hours=3), preferred_end=now + timedelta(hours=5)
    )
    res_60m = cand_service.find_integration_candidates([t5, t6])
    assert res_60m.total_candidates_found == 1

    # 4d. 61 min gap -> NOT Candidate
    t7 = create_base_task(
        request_id="T7", department=Department.ENGINEERING, section="SEC_W",
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t8 = create_base_task(
        request_id="T8", department=Department.SIGNALLING, section="SEC_W",
        preferred_start=now + timedelta(hours=3, minutes=1), preferred_end=now + timedelta(hours=5)
    )
    res_61m = cand_service.find_integration_candidates([t7, t8])
    assert res_61m.total_candidates_found == 0

    # 4e. 12 hr gap -> NOT Candidate
    t9 = create_base_task(
        request_id="T9", department=Department.ENGINEERING, section="SEC_V",
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t10 = create_base_task(
        request_id="T10", department=Department.SIGNALLING, section="SEC_V",
        preferred_start=now + timedelta(hours=14), preferred_end=now + timedelta(hours=16)
    )
    res_12h = cand_service.find_integration_candidates([t9, t10])
    assert res_12h.total_candidates_found == 0

def test_candidate_matching_department_boundaries():
    cand_service = CandidateService()
    
    # Same department twice -> NOT Candidate
    t1 = create_base_task(request_id="T11", department=Department.ENGINEERING, section="SEC_DEPT")
    t2 = create_base_task(request_id="T12", department=Department.ENGINEERING, section="SEC_DEPT")
    res_same = cand_service.find_integration_candidates([t1, t2])
    assert res_same.total_candidates_found == 0

    # 3 distinct departments -> Candidate
    t3 = create_base_task(request_id="T13", department=Department.ENGINEERING, section="SEC_3DEPT")
    t4 = create_base_task(request_id="T14", department=Department.SIGNALLING, section="SEC_3DEPT")
    t5 = create_base_task(request_id="T15", department=Department.TRACTION, section="SEC_3DEPT")
    res_3dept = cand_service.find_integration_candidates([t3, t4, t5])
    assert res_3dept.total_candidates_found == 1
    assert len(res_3dept.groups[0].request_ids) == 3

# 5. SINGLE VS BATCH CONSISTENCY
def test_single_vs_batch_evaluation_consistency():
    service = ScoringService()
    t1 = create_base_task(request_id="T_CONSIST_1", criticality=90.0, urgency=80.0)
    t2 = create_base_task(request_id="T_CONSIST_2", criticality=30.0, urgency=40.0)

    single1 = service.evaluate_task(t1)
    single2 = service.evaluate_task(t2)
    batch = service.evaluate_batch([t1, t2])

    b1 = next(item for item in batch if item.request_id == "T_CONSIST_1")
    b2 = next(item for item in batch if item.request_id == "T_CONSIST_2")

    assert single1.priority_score == b1.priority_score
    assert single1.priority_level == b1.priority_level
    assert single1.risk_score == b1.risk_score
    assert single1.risk_level == b1.risk_level
    assert single1.reason_codes == b1.reason_codes

    assert single2.priority_score == b2.priority_score
    assert single2.priority_level == b2.priority_level
    assert single2.risk_score == b2.risk_score
    assert single2.risk_level == b2.risk_level
    assert single2.reason_codes == b2.reason_codes
