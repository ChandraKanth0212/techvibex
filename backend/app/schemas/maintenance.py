from typing import Optional, List
from datetime import datetime
from pydantic import Field
from backend.app.schemas.base import RailOptBaseSchema, SourceTrackingMixin, DepartmentEnum


class MaintenanceTaskBase(RailOptBaseSchema):
    task_code: str = Field(..., alias="taskCode")
    department: DepartmentEnum
    title: str
    description: Optional[str] = None
    asset_id: Optional[str] = Field(None, alias="assetId")
    corridor_id: str = Field(..., alias="corridorId")
    status: str = "PLANNED"
    priority: str = "MEDIUM"
    estimated_duration_minutes: int = Field(..., alias="estimatedDurationMinutes", ge=1)
    start_time_window: Optional[datetime] = Field(None, alias="startTimeWindow")
    end_time_window: Optional[datetime] = Field(None, alias="endTimeWindow")
    required_resources: Optional[List[str]] = Field(default_factory=list, alias="requiredResources")


class MaintenanceTaskCreate(MaintenanceTaskBase, SourceTrackingMixin):
    pass


class MaintenanceTaskRead(MaintenanceTaskBase, SourceTrackingMixin):
    id: str


class MaintenanceTaskUpdate(RailOptBaseSchema):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    estimated_duration_minutes: Optional[int] = Field(None, alias="estimatedDurationMinutes")
    start_time_window: Optional[datetime] = Field(None, alias="startTimeWindow")
    end_time_window: Optional[datetime] = Field(None, alias="endTimeWindow")
