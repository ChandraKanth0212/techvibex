"""GoodsForecast: predicted goods-train traffic demand on a section."""

from datetime import date, datetime, time, timezone

from pydantic import BaseModel, Field, model_validator


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class GoodsForecast(BaseModel):
    forecast_id: str = Field(min_length=1)
    corridor_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    date: date
    window_start: time
    window_end: time
    probability: float = Field(ge=0.0, le=1.0)
    volume_tonnes: float = Field(default=0.0, ge=0.0)
    generated_at: datetime = Field(default_factory=_now_utc)

    @model_validator(mode="after")
    def _check_window(self) -> "GoodsForecast":
        if self.window_end <= self.window_start:
            raise ValueError("window_end must be after window_start")
        return self