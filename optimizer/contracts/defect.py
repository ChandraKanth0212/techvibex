"""Defect: an identified flaw on an asset that drives maintenance tasks."""

from datetime import datetime

from pydantic import BaseModel, Field

from .enums import SeverityLevel


class Defect(BaseModel):
    defect_id: str = Field(min_length=1)
    asset_id: str = Field(min_length=1)
    severity: SeverityLevel
    description: str = ""
    detected_at: datetime
    detected_by: str = "system"
    recommended_window_days: int = Field(default=7, ge=0)