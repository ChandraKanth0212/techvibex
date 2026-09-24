from typing import Optional
from datetime import datetime
from pydantic import Field
from backend.app.schemas.base import RailOptBaseSchema, SourceTrackingMixin


class CorridorBase(RailOptBaseSchema):
    corridor_code: str = Field(..., alias="corridorCode")
    name: str
    start_station: str = Field(..., alias="startStation")
    end_station: str = Field(..., alias="endStation")
    total_length_km: float = Field(..., alias="totalLengthKm", ge=0)
    tracks_count: int = Field(2, alias="tracksCount", ge=1)
    electrified: bool = True
    status: str = "OPERATIONAL"


class CorridorCreate(CorridorBase, SourceTrackingMixin):
    pass


class CorridorRead(CorridorBase, SourceTrackingMixin):
    id: str
