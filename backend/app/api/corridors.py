from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.repositories.corridor import CorridorRepository
from backend.app.schemas.corridor import CorridorRead

router = APIRouter(prefix="/corridors", tags=["Corridors"])


@router.get("", response_model=List[CorridorRead])
async def get_corridors(
    electrified: Optional[bool] = Query(None, description="Filter by electrification status"),
    corridor_status: Optional[str] = Query(None, alias="status", description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    repo = CorridorRepository(db)
    filters = {
        "electrified": electrified,
        "status": corridor_status
    }
    return await repo.get_all(skip=skip, limit=limit, filters=filters)
