"""Response contract for the health endpoint."""

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: str = Field(default="ok", alias="status")
    module: str = Field(default="optimization-engine", alias="module")
    data_mode: str = Field(default="SYNTHETIC_DEMO", alias="dataMode")


__all__ = ["HealthResponse"]