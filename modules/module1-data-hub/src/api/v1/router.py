from fastapi import APIRouter
from src.api.v1.ingest import router as ingest_router
from src.api.v1.state import router as state_router
from src.api.v1.infrastructure import router as infra_router
from src.api.v1.synthetic import router as synthetic_router
from src.api.v1.streams import router as streams_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(ingest_router)
api_v1_router.include_router(state_router)
api_v1_router.include_router(infra_router)
api_v1_router.include_router(synthetic_router)
api_v1_router.include_router(streams_router)
