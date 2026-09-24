import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
from railopt_contracts import LiveTelemetryEntity
from src.adapters.base import BaseRailwayAdapter


class RtisGpsAdapter(BaseRailwayAdapter):
    """Adapter for ISRO Real-Time Train Information System (RTIS GPS feeds)."""

    async def parse_payload(self, raw_data: Dict[str, Any]) -> List[LiveTelemetryEntity]:
        # raw_data format: {"train_number": "12951", "train_id": "...", "lat": 28.61, "lon": 77.23, "speed": 110.0, "timestamp": "..."}
        train_id = uuid.UUID(raw_data["train_id"]) if "train_id" in raw_data and raw_data["train_id"] else uuid.uuid4()
        timestamp = datetime.fromisoformat(raw_data["timestamp"]) if "timestamp" in raw_data else datetime.now(timezone.utc)
        
        telemetry = LiveTelemetryEntity(
            telemetry_id=uuid.uuid4(),
            train_id=train_id,
            train_number=raw_data.get("train_number", "UNKNOWN"),
            timestamp=timestamp,
            latitude=float(raw_data.get("lat", 0.0)),
            longitude=float(raw_data.get("lon", 0.0)),
            speed_kmh=float(raw_data.get("speed", 0.0)),
            heading=float(raw_data.get("heading", 0.0)),
            delay_minutes=float(raw_data.get("delay_minutes", 0.0)),
            current_signal_aspect=raw_data.get("signal_aspect", "GREEN")
        )
        return [telemetry]

    async def validate(self, canonical_entities: List[LiveTelemetryEntity]) -> List[LiveTelemetryEntity]:
        valid = []
        for item in canonical_entities:
            # Lat/Lon boundaries for Indian Railways (lat ~6 to 37, lon ~68 to 97)
            if 5.0 <= item.latitude <= 40.0 and 65.0 <= item.longitude <= 100.0:
                valid.append(item)
        return valid
