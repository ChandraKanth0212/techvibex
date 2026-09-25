"""MaintenanceTask: a unit of maintenance work that must be scheduled."""

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from .enums import PriorityLevel, WorkType


class MaintenanceTask(BaseModel):
    task_id: str = Field(min_length=1)
    asset_id: str = Field(min_length=1)
    corridor_id: str = Field(min_length=1)
    work_type: WorkType
    estimated_duration_minutes: int = Field(gt=0)
    priority: PriorityLevel = PriorityLevel.MEDIUM
    department: str | None = None
    required_resources: list[str] = Field(default_factory=list)
    required_track_slots: int = Field(default=1, ge=1)
    window_start: datetime | None = None
    window_end: datetime | None = None
    due_by: date | None = None
    description: str = ""
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_window(self) -> "MaintenanceTask":
        if (
            self.window_start is not None
            and self.window_end is not None
            and self.window_end <= self.window_start
        ):
            raise ValueError("window_end must be after window_start")
        return self