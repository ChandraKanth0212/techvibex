from fastapi import APIRouter
from app.api.v1.endpoints import evaluate, scoring, candidate, health

api_router = APIRouter()

api_router.include_router(evaluate.router, prefix="/evaluate", tags=["Evaluation & Scoring"])
api_router.include_router(scoring.router, prefix="/scoring", tags=["Scoring Configuration"])
api_router.include_router(candidate.router, prefix="/candidate", tags=["Candidate Matching"])
api_router.include_router(health.router, tags=["Health Probe"])
