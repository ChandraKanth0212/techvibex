from fastapi import APIRouter
from backend.app.api.assets import router as assets_router
from backend.app.api.maintenance import router as maintenance_router
from backend.app.api.defects import router as defects_router
from backend.app.api.block_requests import router as block_requests_router
from backend.app.api.corridors import router as corridors_router
from backend.app.api.trains import router as trains_router
from backend.app.api.goods_forecasts import router as goods_forecasts_router
from backend.app.api.resources import router as resources_router

api_router = APIRouter(prefix="/api")

api_router.include_router(assets_router)
api_router.include_router(maintenance_router)
api_router.include_router(defects_router)
api_router.include_router(block_requests_router)
api_router.include_router(corridors_router)
api_router.include_router(trains_router)
api_router.include_router(goods_forecasts_router)
api_router.include_router(resources_router)
