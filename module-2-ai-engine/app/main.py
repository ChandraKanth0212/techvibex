from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.logging import logger
from app.core.exceptions import Module2BaseException
from app.api.v1.router import api_router

app = FastAPI(
    title=settings.app_name,
    description="RailOpt AI Intelligence Engine - Module 2 API Service",
    version="1.0.0-prototype",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Domain Exception Handler (RFC 7807 problem details format)
@app.exception_handler(Module2BaseException)
async def module2_exception_handler(request: Request, exc: Module2BaseException):
    logger.error(f"Domain exception on {request.url.path}: {exc.message}", extra={"details": exc.details})
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "type": "https://railopt.sih.gov.in/errors/domain-error",
            "title": exc.__class__.__name__,
            "status": exc.status_code,
            "detail": exc.message,
            "instance": request.url.path,
            "details": exc.details
        },
    )

# Root endpoint
@app.get("/", summary="Module 2 Root Information")
def root():
    return {
        "service": settings.app_name,
        "version": "1.0.0-prototype",
        "docs": "/docs",
        "status": "operational"
    }

# Include API v1 routes
app.include_router(api_router, prefix="/api/v1")
