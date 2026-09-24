from typing import List
from fastapi import APIRouter
from app.schemas.source_data import MaintenanceTaskInput
from app.schemas.integration import IntegrationCandidateResponse
from app.services.candidate_service import CandidateService
from app.core.config import load_scoring_config

router = APIRouter()

@router.post("/match", response_model=IntegrationCandidateResponse, summary="Detect Integration Candidates Across Tasks")
def match_candidates(tasks: List[MaintenanceTaskInput]) -> IntegrationCandidateResponse:
    """Standalone endpoint to identify spatial-temporal integration candidate groupings across tasks."""
    config = load_scoring_config()
    service = CandidateService(config)
    return service.find_integration_candidates(tasks)
