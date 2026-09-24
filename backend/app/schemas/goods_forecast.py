from typing import Optional
from datetime import datetime
from pydantic import Field
from backend.app.schemas.base import RailOptBaseSchema, SourceTrackingMixin


class GoodsForecastBase(RailOptBaseSchema):
    forecast_code: str = Field(..., alias="forecastCode")
    origin_hub: str = Field(..., alias="originHub")
    destination_hub: str = Field(..., alias="destinationHub")
    corridor_id: str = Field(..., alias="corridorId")
    estimated_departure: datetime = Field(..., alias="estimatedDeparture")
    estimated_arrival: datetime = Field(..., alias="estimatedArrival")
    cargo_type: str = Field(..., alias="cargoType")
    priority: int = Field(5, ge=1, le=10)
    status: str = "FORECASTED"


class GoodsForecastCreate(GoodsForecastBase, SourceTrackingMixin):
    pass


class GoodsForecastRead(GoodsForecastBase, SourceTrackingMixin):
    id: str
