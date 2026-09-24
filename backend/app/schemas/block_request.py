from typing import Optional, List
from datetime import datetime
from pydantic import Field
from backend.app.schemas.base import RailOptBaseSchema, SourceTrackingMixin, DepartmentEnum


class BlockRequestBase(RailOptBaseSchema):
    request_code: str = Field(..., alias="requestCode")
    department: DepartmentEnum
    corridor_id: str = Field(..., alias="corridorId")
    asset_ids: Optional[List[str]] = Field(default_factory=list, alias="assetIds")
    requested_start_time: datetime = Field(..., alias="requestedStartTime")
    requested_end_time: datetime = Field(..., alias="requestedEndTime")
    min_duration_minutes: int = Field(..., alias="minDurationMinutes", ge=1)
    flexible: bool = True
    status: str = "SUBMITTED"


class BlockRequestCreate(BlockRequestBase, SourceTrackingMixin):
    pass


class BlockRequestRead(BlockRequestBase, SourceTrackingMixin):
    id: str


class BlockRequestUpdate(RailOptBaseSchema):
    status: Optional[str] = None
    requested_start_time: Optional[datetime] = Field(None, alias="requestedStartTime")
    requested_end_time: Optional[datetime] = Field(None, alias="requestedEndTime")
