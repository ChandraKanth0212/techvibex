from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.repositories.train import TrainRepository
from backend.app.schemas.train import TrainRead

router = APIRouter(prefix="/trains", tags=["Trains"])


@router.get("", response_model=List[TrainRead])
async def get_trains(
    train_type: Optional[str] = Query(None, alias="trainType", description="Filter by train type (VANDE_BHARAT, RAJDHANI, EXPRESS, FREIGHT)"),
    train_status: Optional[str] = Query(None, alias="status", description="Filter by train status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    repo = TrainRepository(db)
    filters = {
        "train_type": train_type,
        "status": train_status
    }
    return await repo.get_all(skip=skip, limit=limit, filters=filters)
