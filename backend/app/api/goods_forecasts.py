from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.repositories.goods_forecast import GoodsForecastRepository
from backend.app.schemas.goods_forecast import GoodsForecastRead

router = APIRouter(prefix="/goods-forecasts", tags=["Goods Forecasts"])


@router.get("", response_model=List[GoodsForecastRead])
async def get_goods_forecasts(
    corridor_id: Optional[str] = Query(None, alias="corridorId", description="Filter by corridor ID"),
    cargo_type: Optional[str] = Query(None, alias="cargoType", description="Filter by cargo type"),
    forecast_status: Optional[str] = Query(None, alias="status", description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    repo = GoodsForecastRepository(db)
    filters = {
        "corridor_id": corridor_id,
        "cargo_type": cargo_type,
        "status": forecast_status
    }
    return await repo.get_all(skip=skip, limit=limit, filters=filters)
