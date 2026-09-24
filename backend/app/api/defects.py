from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.repositories.defect import DefectRepository
from backend.app.schemas.defect import DefectRead, DefectCreate
from backend.app.services.validation_service import validation_service

router = APIRouter(prefix="/defects", tags=["Defects"])


@router.get("", response_model=List[DefectRead])
async def get_defects(
    department: Optional[str] = Query(None, description="Filter by department"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    defect_status: Optional[str] = Query(None, alias="status", description="Filter by defect status"),
    asset_id: Optional[str] = Query(None, alias="assetId", description="Filter by asset ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    repo = DefectRepository(db)
    filters = {
        "department": department,
        "severity": severity,
        "status": defect_status,
        "asset_id": asset_id
    }
    return await repo.get_all(skip=skip, limit=limit, filters=filters)


@router.post("", response_model=DefectRead, status_code=status.HTTP_201_CREATED)
async def create_defect(
    payload: DefectCreate,
    db: AsyncSession = Depends(get_db)
):
    valid, msg = validation_service.validate_payload("defect", payload.model_dump(by_alias=True, mode="json"))
    if not valid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)

    repo = DefectRepository(db)
    created = await repo.create(payload.model_dump())
    return created
