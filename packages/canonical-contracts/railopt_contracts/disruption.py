from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class DisruptionSeverity(str, Enum):
    LOW = "LOW"            # Speed restriction 30 km/h
    MEDIUM = "MEDIUM"      # Single track blocked on double line
    HIGH = "HIGH"          # Complete section closure
    CRITICAL = "CRITICAL"  # Major derailment / OHE failure


class DisruptionType(str, Enum):
    SIGNAL_FAILURE = "SIGNAL_FAILURE"
    MAINTENANCE_BLOCK = "MAINTENANCE_BLOCK"
    WEATHER_FOG = "WEATHER_FOG"
    TRACK_DAMAGE = "TRACK_DAMAGE"
    POWER_FAILURE = "POWER_FAILURE"
    ACCIDENT = "ACCIDENT"


class DisruptionEntity(BaseModel):
    disruption_id: UUID = Field(..., description="Unique disruption UUID")
    disruption_type: DisruptionType = Field(..., description="Classification of disruption")
    severity: DisruptionSeverity = Field(..., description="Severity level")
    section_id: Optional[UUID] = Field(None, description="Affected track section ID")
    station_id: Optional[UUID] = Field(None, description="Affected station ID")
    start_time: datetime = Field(..., description="Disruption start timestamp")
    estimated_end_time: Optional[datetime] = Field(None, description="Estimated completion timestamp")
    speed_limit_kmh: Optional[float] = Field(None, description="Imposed speed restriction limit in km/h")
    description: Optional[str] = Field(None, description="Human-readable description")
    is_active: bool = Field(default=True, description="Whether disruption is actively restricting traffic")

    class Config:
        from_attributes = True
