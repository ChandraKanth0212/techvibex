from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.repositories.block_request import BlockRequestRepository
from backend.app.schemas.block_request import BlockRequestRead, BlockRequestCreate
from backend.app.services.validation_service import validation_service

router = APIRouter(prefix="/block-requests", tags=["Block Requests"])


@router.get("", response_model=List[BlockRequestRead])
async def get_block_requests(
    department: Optional[str] = Query(None, description="Filter by department"),
    corridor_id: Optional[str] = Query(None, alias="corridorId", description="Filter by corridor ID"),
    request_status: Optional[str] = Query(None, alias="status", description="Filter by request status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    repo = BlockRequestRepository(db)
    filters = {
        "department": department,
        "corridor_id": corridor_id,
        "status": request_status
    }
    return await repo.get_all(skip=skip, limit=limit, filters=filters)


@router.get("/{request_id}", response_model=BlockRequestRead)
async def get_block_request_by_id(request_id: str, db: AsyncSession = Depends(get_db)):
    repo = BlockRequestRepository(db)
    req = await repo.get_by_id(request_id)
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Block request with ID '{request_id}' not found."
        )
    return req


@router.post("", response_model=BlockRequestRead, status_code=status.HTTP_201_CREATED)
async def create_block_request(
    payload: BlockRequestCreate,
    db: AsyncSession = Depends(get_db)
):
    valid, msg = validation_service.validate_payload("block-request", payload.model_dump(by_alias=True, mode="json"))
    if not valid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)

    repo = BlockRequestRepository(db)
    created = await repo.create(payload.model_dump())
    return created
