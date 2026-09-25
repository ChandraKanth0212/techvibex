"""Corridor: a railway corridor over which blocks may be planned."""

from pydantic import BaseModel, Field


class Corridor(BaseModel):
    corridor_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    origin_station: str = Field(min_length=1)
    destination_station: str = Field(min_length=1)
    sections: list[str] = Field(default_factory=list)
    gauge: str = Field(default="broad")
    electrified: bool = True
    max_speed_kmph: float = Field(default=130.0, gt=0.0)