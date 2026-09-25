"""ExistingBlock: a block already on the books (constraint input / output)."""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from .enums import BlockStatus, OccupancyType


class ExistingBlock(BaseModel):
    block_id: str = Field(min_length=1)
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    start_time: datetime
    end_time: datetime
    occupancy_type: OccupancyType = OccupancyType.TRAFFIC_BLOCK
    status: BlockStatus = BlockStatus.PLANNED
    related_task_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_times(self) -> "ExistingBlock":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self