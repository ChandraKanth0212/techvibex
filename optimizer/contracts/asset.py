"""Asset: a physical railway asset that may require maintenance."""

from pydantic import BaseModel, Field

from .enums import AssetType


class Asset(BaseModel):
    asset_id: str = Field(min_length=1)
    asset_type: AssetType
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    track_id: str | None = None
    length_metres: float = Field(default=0.0, ge=0.0)
    electrified: bool = True
    condition_score: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: dict = Field(default_factory=dict)