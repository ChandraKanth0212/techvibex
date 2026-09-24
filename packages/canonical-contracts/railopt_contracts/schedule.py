from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class ScheduleStopEntity(BaseModel):
    stop_id: UUID = Field(..., description="Unique stop UUID")
    schedule_id: UUID = Field(..., description="Parent schedule ID")
    station_id: UUID = Field(..., description="Station UUID")
    station_code: str = Field(..., description="Station code e.g. 'NDLS'")
    stop_sequence: int = Field(..., description="Sequence number of stop (1, 2, 3...)")
    scheduled_arrival: Optional[str] = Field(None, description="Scheduled arrival time 'HH:MM:SS'")
    scheduled_departure: Optional[str] = Field(None, description="Scheduled departure time 'HH:MM:SS'")
    scheduled_halt_minutes: int = Field(default=0, description="Dwell time in minutes")
    platform_number: Optional[int] = Field(None, description="Assigned platform number")

    class Config:
        from_attributes = True


class ScheduleMasterEntity(BaseModel):
    schedule_id: UUID = Field(..., description="Unique schedule UUID")
    train_id: UUID = Field(..., description="Train UUID")
    train_number: str = Field(..., description="Train number e.g. '12951'")
    origin_station_code: str = Field(..., description="Origin station code")
    destination_station_code: str = Field(..., description="Destination station code")
    stops: List[ScheduleStopEntity] = Field(default_factory=list, description="Ordered list of stops")

    class Config:
        from_attributes = True
