from typing import Optional
from datetime import datetime
from pydantic import Field
from backend.app.schemas.base import RailOptBaseSchema, SourceTrackingMixin, DepartmentEnum


class DefectBase(RailOptBaseSchema):
    defect_code: str = Field(..., alias="defectCode")
    asset_id: str = Field(..., alias="assetId")
    department: DepartmentEnum
    severity: str  # CRITICAL, MAJOR, MINOR
    title: str
    description: Optional[str] = None
    status: str = "OPEN"
    reported_at: Optional[datetime] = Field(default_factory=datetime.utcnow, alias="reportedAt")
    resolved_at: Optional[datetime] = Field(None, alias="resolvedAt")


class DefectCreate(DefectBase, SourceTrackingMixin):
    pass


class DefectRead(DefectBase, SourceTrackingMixin):
    id: str


class DefectUpdate(RailOptBaseSchema):
    status: Optional[str] = None
    severity: Optional[str] = None
    resolved_at: Optional[datetime] = Field(None, alias="resolvedAt")
