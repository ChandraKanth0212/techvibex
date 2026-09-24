from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.database import init_db, AsyncSessionLocal
from backend.app.services.data_service import DataHubService
from backend.app.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    await init_db()
    # Seed synthetic data if empty
    async with AsyncSessionLocal() as session:
        await DataHubService.seed_synthetic_data_if_empty(session)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="RailOpt Module 1 — Data & Integration Hub backend serving canonical railway APIs, synthetic simulators & contract validation for SIH 2026.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware for cross-module integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root Health Check
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "HEALTHY",
        "module": "Module 1 — Data & Integration Hub",
        "version": "1.0.0"
    }


# Include API Router
app.include_router(api_router)
