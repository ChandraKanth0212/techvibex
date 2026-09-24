from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.repositories.maintenance import MaintenanceTaskRepository
from backend.app.schemas.maintenance import MaintenanceTaskRead, MaintenanceTaskCreate
from backend.app.services.validation_service import validation_service

router = APIRouter(prefix="/maintenance", tags=["Maintenance Tasks"])


@router.get("/tasks", response_model=List[MaintenanceTaskRead])
async def get_maintenance_tasks(
    department: Optional[str] = Query(None, description="Filter by department"),
    corridor_id: Optional[str] = Query(None, alias="corridorId", description="Filter by corridor ID"),
    task_status: Optional[str] = Query(None, alias="status", description="Filter by task status"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    repo = MaintenanceTaskRepository(db)
    filters = {
        "department": department,
        "corridor_id": corridor_id,
        "status": task_status,
        "priority": priority
    }
    return await repo.get_all(skip=skip, limit=limit, filters=filters)


@router.get("/tasks/{task_id}", response_model=MaintenanceTaskRead)
async def get_maintenance_task_by_id(task_id: str, db: AsyncSession = Depends(get_db)):
    repo = MaintenanceTaskRepository(db)
    task = await repo.get_by_id(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Maintenance task with ID '{task_id}' not found."
        )
    return task


@router.post("/tasks", response_model=MaintenanceTaskRead, status_code=status.HTTP_201_CREATED)
async def create_maintenance_task(
    payload: MaintenanceTaskCreate,
    db: AsyncSession = Depends(get_db)
):
    # Perform JSON Schema validation using contract
    valid, msg = validation_service.validate_payload("maintenance-task", payload.model_dump(by_alias=True, mode="json"))
    if not valid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)

    repo = MaintenanceTaskRepository(db)
    created = await repo.create(payload.model_dump())
    return created
