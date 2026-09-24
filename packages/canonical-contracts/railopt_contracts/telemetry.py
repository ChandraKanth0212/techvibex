from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class LiveTelemetryEntity(BaseModel):
    telemetry_id: UUID = Field(..., description="Unique telemetry event UUID")
    train_id: UUID = Field(..., description="Train UUID")
    train_number: str = Field(..., description="Train number e.g. '12951'")
    timestamp: datetime = Field(..., description="ISO timestamp of telemetry reading")
    latitude: float = Field(..., description="Current GPS latitude")
    longitude: float = Field(..., description="Current GPS longitude")
    speed_kmh: float = Field(..., description="Current speed in km/h")
    heading: float = Field(default=0.0, description="Heading angle in degrees (0-360)")
    current_section_id: Optional[UUID] = Field(None, description="Current track section ID")
    distance_in_section_km: float = Field(default=0.0, description="Distance traveled into current section in km")
    delay_minutes: float = Field(default=0.0, description="Accumulated delay in minutes (+ delayed, - early)")
    current_signal_aspect: str = Field(default="GREEN", description="Current visible signal aspect")

    class Config:
        from_attributes = True
