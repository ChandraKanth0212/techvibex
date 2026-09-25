"""Resource: anything required to execute a maintenance block."""

from datetime import datetime

from pydantic import BaseModel, Field

from .enums import ResourceType


class Resource(BaseModel):
    resource_id: str = Field(min_length=1)
    resource_type: ResourceType
    name: str = Field(min_length=1)
    capacity: int = Field(default=1, ge=1)
    available_from: datetime | None = None
    available_until: datetime | None = None
    attributes: dict = Field(default_factory=dict)