from datetime import datetime
from typing import Dict, List
from uuid import UUID
from pydantic import BaseModel, Field

from .telemetry import LiveTelemetryEntity
from .disruption import DisruptionEntity


class NetworkStateSnapshot(BaseModel):
    snapshot_id: UUID = Field(..., description="Unique snapshot UUID")
    timestamp: datetime = Field(..., description="Timestamp when snapshot was captured")
    active_trains: List[LiveTelemetryEntity] = Field(default_factory=list, description="All currently running trains")
    active_disruptions: List[DisruptionEntity] = Field(default_factory=list, description="All active line blocks / speed restrictions")
    section_occupancies: Dict[str, List[str]] = Field(
        default_factory=dict, 
        description="Map of section_code -> list of train_numbers occupying section"
    )
    signal_states: Dict[str, str] = Field(
        default_factory=dict, 
        description="Map of signal_code -> current aspect ('GREEN', 'YELLOW', 'RED')"
    )

    class Config:
        from_attributes = True
