from typing import Dict
from fastapi import APIRouter
from datetime import datetime

router = APIRouter()

@router.get("/health", summary="Health Check Probe")
def health_check() -> Dict[str, str]:
    """Liveness probe verifying that Module 2 AI Intelligence Engine service is healthy."""
    return {
        "status": "healthy",
        "service": "RailOpt Module 2 AI Intelligence Engine",
        "timestamp": datetime.utcnow().isoformat()
    }
