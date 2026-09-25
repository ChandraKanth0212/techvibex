"""TrainMovement: scheduled train running on a corridor within the horizon."""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from .enums import TrainDirection


class TrainMovement(BaseModel):
    movement_id: str = Field(min_length=1)
    train_number: str = Field(min_length=1)
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    direction: TrainDirection = TrainDirection.BOTH
    departure: datetime
    arrival: datetime
    stops: list[str] = Field(default_factory=list)
    frequency: str = Field(default="DAILY")

    @model_validator(mode="after")
    def _check_times(self) -> "TrainMovement":
        if self.arrival <= self.departure:
            raise ValueError("arrival must be after departure")
        return self