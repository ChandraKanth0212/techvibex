"""FastAPI application for the Optimization Engine.

Phase 1 exposes ``GET /health``. Phase 7A adds the ``/api/optimizer`` pipeline
endpoints orchestrated through :class:`app.services.pipeline.PlanBuilder` and
an in-memory demo plan store (``SYNTHETIC_DEMO / IN_MEMORY`` — plans are not
persisted across application restarts). Phase 8C freezes that surface into the
stable DTO contract in :mod:`app.schemas.api`, mapped from the internal results
by :mod:`app.api.dto_mappers`, with every failure rendered as the
:class:`~app.schemas.api.ErrorResponse` envelope.
"""

from fastapi import FastAPI

from app import __version__
from app.api.errors import install_exception_handlers
from app.api.health import router as health_router
from app.api.optimizer import router as optimizer_router
from app.api.plan_store import InMemoryPlanStore
from app.core.config import Settings, get_settings
from app.services.pipeline import PlanBuilder


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    application = FastAPI(
        title="RailOpt Optimization Engine",
        version=__version__,
        description=(
            "AI-Assisted Railway Integrated Maintenance Block Planner - Module 3. "
            "Orchestrates candidate generation, integrated-block detection, "
            "CP-SAT schedule optimization, independent validation, KPI "
            "computation and evidence-based explanations."
        ),
    )
    application.state.settings = resolved
    application.state.pipeline = PlanBuilder(settings=resolved)
    application.state.plan_store = InMemoryPlanStore()

    install_exception_handlers(application)

    application.include_router(health_router, tags=["health"])
    application.include_router(optimizer_router)
    return application


app = create_app()

__all__ = ["app", "create_app"]