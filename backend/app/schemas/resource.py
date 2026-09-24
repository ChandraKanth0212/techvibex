from typing import Optional
from datetime import datetime
from pydantic import Field
from backend.app.schemas.base import RailOptBaseSchema, SourceTrackingMixin, DepartmentEnum


class ResourceBase(RailOptBaseSchema):
    resource_code: str = Field(..., alias="resourceCode")
    name: str
    resource_type: str = Field(..., alias="resourceType")
    department: DepartmentEnum
    location: str
    status: str = "AVAILABLE"
    total_quantity: int = Field(1, alias="totalQuantity", ge=1)
    available_quantity: int = Field(1, alias="availableQuantity", ge=0)


class ResourceCreate(ResourceBase, SourceTrackingMixin):
    pass


class ResourceRead(ResourceBase, SourceTrackingMixin):
    id: str
