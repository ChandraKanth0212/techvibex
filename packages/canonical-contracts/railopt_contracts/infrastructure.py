from typing import List, Tuple, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class StationEntity(BaseModel):
    station_id: UUID = Field(..., description="Unique UUID for station")
    code: str = Field(..., description="Station code e.g. 'NDLS'")
    name: str = Field(..., description="Full station name e.g. 'New Delhi'")
    latitude: float = Field(..., description="Latitude coordinate")
    longitude: float = Field(..., description="Longitude coordinate")
    total_platforms: int = Field(default=10, description="Number of passenger platforms")
    loop_lines_count: int = Field(default=4, description="Number of holding / loop lines")
    is_junction: bool = Field(default=False, description="Whether station is a junction")

    class Config:
        from_attributes = True


class TrackSectionEntity(BaseModel):
    section_id: UUID = Field(..., description="Unique section UUID")
    section_code: str = Field(..., description="Section code e.g. 'SEC_NDLS_CNB_01'")
    source_station_code: str = Field(..., description="Origin station code")
    target_station_code: str = Field(..., description="Destination station code")
    length_km: float = Field(..., description="Section length in kilometers")
    max_speed_kmh: float = Field(default=130.0, description="Maximum section speed limit in km/h")
    track_count: int = Field(default=2, description="1=Single, 2=Double, 4=Quad track")
    gradient_per_thousand: float = Field(default=0.0, description="Gradient profile")
    geo_path: List[Tuple[float, float]] = Field(default_factory=list, description="Ordered lat/lon coordinates")
    is_blocked: bool = Field(default=False, description="Whether section has active maintenance block")

    class Config:
        from_attributes = True


class SignalAspect(str):
    GREEN = "GREEN"
    DOUBLE_YELLOW = "DOUBLE_YELLOW"
    YELLOW = "YELLOW"
    RED = "RED"


class SignalEntity(BaseModel):
    signal_id: UUID = Field(..., description="Unique signal UUID")
    section_id: UUID = Field(..., description="Track section ID where signal is installed")
    signal_code: str = Field(..., description="Signal identifier e.g. 'SIG_NDLS_01'")
    position_km: float = Field(..., description="Position along track section in km")
    aspect: str = Field(default="GREEN", description="Current signal aspect")

    class Config:
        from_attributes = True
