import pytest
from datetime import datetime, timedelta
from app.schemas.source_data import MaintenanceTaskInput, Department
from app.services.candidate_service import CandidateService

def test_candidate_service_overlapping_windows_candidate():
    config = {"candidate_matching": {"max_time_gap_minutes": 60}}
    service = CandidateService(config)
    now = datetime.utcnow()
    
    t1 = MaintenanceTaskInput(
        request_id="REQ-T1", department=Department.ENGINEERING, asset_id="A1",
        asset_type="RAIL", section="SEC_ALPHA", location="KM10", work_type="Track",
        description="Track repair", duration_minutes=60,
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t2 = MaintenanceTaskInput(
        request_id="REQ-T2", department=Department.SIGNALLING, asset_id="A2",
        asset_type="SIGNAL", section="SEC_ALPHA", location="KM12", work_type="Signal",
        description="Signal check", duration_minutes=60,
        preferred_start=now + timedelta(hours=1), preferred_end=now + timedelta(hours=3)
    )
    
    resp = service.find_integration_candidates([t1, t2])
    assert resp.total_candidates_found == 1
    assert "REQ-T1" in resp.groups[0].request_ids
    assert "REQ-T2" in resp.groups[0].request_ids

def test_candidate_service_small_gap_within_limit_candidate():
    config = {"candidate_matching": {"max_time_gap_minutes": 60}}
    service = CandidateService(config)
    now = datetime.utcnow()
    
    t1 = MaintenanceTaskInput(
        request_id="REQ-T1", department=Department.ENGINEERING, asset_id="A1",
        asset_type="RAIL", section="SEC_ALPHA", location="KM10", work_type="Track",
        description="Track repair", duration_minutes=60,
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t2 = MaintenanceTaskInput(
        request_id="REQ-T2", department=Department.TRACTION, asset_id="A3",
        asset_type="OHE", section="SEC_ALPHA", location="KM14", work_type="OHE",
        description="OHE work", duration_minutes=60,
        preferred_start=now + timedelta(hours=2, minutes=30), preferred_end=now + timedelta(hours=4)
    )
    
    # Gap is 30 minutes (<= 60 minutes) -> Candidate!
    resp = service.find_integration_candidates([t1, t2])
    assert resp.total_candidates_found == 1

def test_candidate_service_large_gap_beyond_limit_not_candidate():
    config = {"candidate_matching": {"max_time_gap_minutes": 60}}
    service = CandidateService(config)
    now = datetime.utcnow()
    
    t1 = MaintenanceTaskInput(
        request_id="REQ-T1", department=Department.ENGINEERING, asset_id="A1",
        asset_type="RAIL", section="SEC_ALPHA", location="KM10", work_type="Track",
        description="Track repair", duration_minutes=60,
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t2 = MaintenanceTaskInput(
        request_id="REQ-T2", department=Department.SIGNALLING, asset_id="A2",
        asset_type="SIGNAL", section="SEC_ALPHA", location="KM12", work_type="Signal",
        description="Signal check", duration_minutes=60,
        preferred_start=now + timedelta(hours=8), preferred_end=now + timedelta(hours=10)
    )
    
    # Gap is 6 hours (> 60 minutes) -> Not a candidate!
    resp = service.find_integration_candidates([t1, t2])
    assert resp.total_candidates_found == 0

def test_candidate_service_same_department_not_multi_department():
    config = {"candidate_matching": {"max_time_gap_minutes": 60}}
    service = CandidateService(config)
    now = datetime.utcnow()
    
    t1 = MaintenanceTaskInput(
        request_id="REQ-T1", department=Department.ENGINEERING, asset_id="A1",
        asset_type="RAIL", section="SEC_ALPHA", location="KM10", work_type="Track",
        description="Track repair 1", duration_minutes=60,
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    t2 = MaintenanceTaskInput(
        request_id="REQ-T2", department=Department.ENGINEERING, asset_id="A2",
        asset_type="RAIL", section="SEC_ALPHA", location="KM12", work_type="Track",
        description="Track repair 2", duration_minutes=60,
        preferred_start=now, preferred_end=now + timedelta(hours=2)
    )
    
    # Same department (ENGINEERING + ENGINEERING) -> Not multi-department candidate!
    resp = service.find_integration_candidates([t1, t2])
    assert resp.total_candidates_found == 0
