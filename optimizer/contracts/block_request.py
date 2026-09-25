"""BlockRequest: a request for a maintenance block / possession window."""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from .enums import OccupancyType


class BlockRequest(BaseModel):
    request_id: str = Field(min_length=1)
    task_ids: list[str] = Field(min_length=1)
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    requested_start: datetime
    requested_end: datetime
    occupancy_type: OccupancyType = OccupancyType.TRAFFIC_BLOCK
    notes: str = ""

    @model_validator(mode="after")
    def _check_window(self) -> "BlockRequest":
        if self.requested_end <= self.requested_start:
            raise ValueError("requested_end must be after requested_start")
        return self