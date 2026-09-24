from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.repositories.asset import AssetRepository
from backend.app.schemas.asset import AssetRead, AssetCreate
from backend.app.services.validation_service import validation_service

router = APIRouter(prefix="/assets", tags=["Assets"])


@router.get("", response_model=List[AssetRead])
async def get_assets(
    department: Optional[str] = Query(None, description="Filter by department (ENGINEERING, SIGNAL_TELECOMMUNICATION, TRACTION)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by asset status"),
    asset_type: Optional[str] = Query(None, alias="assetType", description="Filter by asset type"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    repo = AssetRepository(db)
    filters = {
        "department": department,
        "status": status_filter,
        "asset_type": asset_type
    }
    return await repo.get_all(skip=skip, limit=limit, filters=filters)


@router.get("/{asset_id}", response_model=AssetRead)
async def get_asset_by_id(asset_id: str, db: AsyncSession = Depends(get_db)):
    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset with ID '{asset_id}' not found."
        )
    return asset
