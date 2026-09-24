from typing import Optional
from datetime import datetime
from pydantic import Field
from backend.app.schemas.base import RailOptBaseSchema, SourceTrackingMixin, DepartmentEnum, SourceSystemEnum


class AssetBase(RailOptBaseSchema):
    asset_code: str = Field(..., alias="assetCode")
    name: str
    asset_type: str = Field(..., alias="assetType")
    location: str
    line_section: str = Field(..., alias="lineSection")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = "OPERATIONAL"
    department: DepartmentEnum


class AssetCreate(AssetBase, SourceTrackingMixin):
    pass


class AssetRead(AssetBase, SourceTrackingMixin):
    id: str


class AssetUpdate(RailOptBaseSchema):
    name: Optional[str] = None
    status: Optional[str] = None
    department: Optional[DepartmentEnum] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
