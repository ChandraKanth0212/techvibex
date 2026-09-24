from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.repositories.resource import ResourceRepository
from backend.app.schemas.resource import ResourceRead

router = APIRouter(prefix="/resources", tags=["Resources"])


@router.get("", response_model=List[ResourceRead])
async def get_resources(
    department: Optional[str] = Query(None, description="Filter by department"),
    resource_type: Optional[str] = Query(None, alias="resourceType", description="Filter by resource type"),
    resource_status: Optional[str] = Query(None, alias="status", description="Filter by resource status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    repo = ResourceRepository(db)
    filters = {
        "department": department,
        "resource_type": resource_type,
        "status": resource_status
    }
    return await repo.get_all(skip=skip, limit=limit, filters=filters)
