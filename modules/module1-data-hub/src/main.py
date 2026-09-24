from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.config import settings
from src.api.v1.router import api_v1_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="RailOpt Module 1 — Data & Integration Hub backend serving canonical railway APIs, telemetry streams, and synthetic simulators for SIH 2026.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware for Module 4 Command Center UI cross-origin access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "HEALTHY",
        "module": "Module 1 — Data & Integration Hub",
        "version": "0.1.0"
    }
