from typing import Optional
from datetime import datetime
from pydantic import Field
from backend.app.schemas.base import RailOptBaseSchema, SourceTrackingMixin


class TrainBase(RailOptBaseSchema):
    train_number: str = Field(..., alias="trainNumber")
    train_name: str = Field(..., alias="trainName")
    train_type: str = Field(..., alias="trainType")
    priority: int = Field(5, ge=1, le=10)
    origin: str
    destination: str
    scheduled_departure: datetime = Field(..., alias="scheduledDeparture")
    scheduled_arrival: datetime = Field(..., alias="scheduledArrival")
    status: str = "ON_TIME"


class TrainCreate(TrainBase, SourceTrackingMixin):
    pass


class TrainRead(TrainBase, SourceTrackingMixin):
    id: str
