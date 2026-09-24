from typing import Dict, Any
from fastapi import APIRouter
from app.core.config import load_scoring_config

router = APIRouter()

@router.get("/weights", summary="Fetch Active Scoring Configuration Weights & Thresholds")
def get_scoring_weights() -> Dict[str, Any]:
    """Returns the current active YAML scoring weights, thresholds, and overdue multipliers."""
    return load_scoring_config()
