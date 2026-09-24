from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.source_data import MaintenanceTaskInput
from app.schemas.ai_output import AIRecommendation
from app.services.scoring_service import ScoringService

router = APIRouter()

def get_scoring_service() -> ScoringService:
    return ScoringService()

@router.post("/task", response_model=AIRecommendation, status_code=status.HTTP_200_OK, summary="Evaluate Single Maintenance Task")
def evaluate_single_task(
    task: MaintenanceTaskInput,
    service: ScoringService = Depends(get_scoring_service)
) -> AIRecommendation:
    """
    Evaluates a single maintenance task input and produces a deterministic AIRecommendation.
    Computes priority score, risk metrics, reason codes, and plain English explanation.
    """
    try:
        return service.evaluate_task(task)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error evaluating maintenance task: {str(e)}"
        )

@router.post("/batch", response_model=List[AIRecommendation], status_code=status.HTTP_200_OK, summary="Evaluate Batch Tasks & Detect Integration Candidates")
def evaluate_batch_tasks(
    tasks: List[MaintenanceTaskInput],
    service: ScoringService = Depends(get_scoring_service)
) -> List[AIRecommendation]:
    """
    Evaluates a batch of maintenance tasks, computes component factor scores,
    and identifies spatial-temporal shadow/integrated block candidates across departments.
    """
    try:
        return service.evaluate_batch(tasks)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error evaluating batch maintenance tasks: {str(e)}"
        )
