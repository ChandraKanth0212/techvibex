import asyncio
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from railopt_contracts import LiveTelemetryEntity, DisruptionEntity
from src.synthetic.presets import NDLS_CNB_CORRIDOR_PRESET


class SimulationEngine:
    """Async tick simulator for train physics, signal progression, and real-time movement."""

    def __init__(self):
        self.is_running: bool = False
        self.tick_rate_seconds: float = 1.0
        self.time_multiplier: float = 5.0  # 5x speed fast-forward by default
        self.active_telemetry: Dict[str, LiveTelemetryEntity] = {}
        self.active_disruptions: List[DisruptionEntity] = []
        self._setup_initial_train_positions()

    def _setup_initial_train_positions(self):
        """Initializes train starting points along NDLS-CNB sections."""
        now = datetime.now(timezone.utc)
        sections = NDLS_CNB_CORRIDOR_PRESET["sections"]
        
        for idx, train in enumerate(NDLS_CNB_CORRIDOR_PRESET["trains"]):
            section = sections[min(idx, len(sections) - 1)]
            start_lat = section["geo_path"][0][0]
            start_lon = section["geo_path"][0][1]
            
            self.active_telemetry[train["train_number"]] = LiveTelemetryEntity(
                telemetry_id=uuid.uuid4(),
                train_id=uuid.UUID(train["id"]),
                train_number=train["train_number"],
                timestamp=now,
                latitude=start_lat,
                longitude=start_lon,
                speed_kmh=float(train["max_speed_kmh"] * 0.8),
                heading=110.0,
                current_section_id=uuid.UUID(section["id"]),
                distance_in_section_km=1.0 + (idx * 5.0),
                delay_minutes=0.0,
                current_signal_aspect="GREEN"
            )

    def tick(self) -> List[LiveTelemetryEntity]:
        """Advances simulation state by 1 tick."""
        updated_list = []
        now = datetime.now(timezone.utc)

        for train_num, tel in self.active_telemetry.items():
            # Find train spec
            train_spec = next((t for t in NDLS_CNB_CORRIDOR_PRESET["trains"] if t["train_number"] == train_num), None)
            max_speed = train_spec["max_speed_kmh"] if train_spec else 100.0

            # Check for active disruptions in section
            speed_limit = max_speed
            for d in self.active_disruptions:
                if d.is_active and d.section_id == tel.current_section_id and d.speed_limit_kmh:
                    speed_limit = min(speed_limit, d.speed_limit_kmh)

            effective_speed = min(tel.speed_kmh, speed_limit)

            # Advance distance based on speed and time delta (tick_rate * multiplier)
            hours_elapsed = (self.tick_rate_seconds * self.time_multiplier) / 3600.0
            distance_delta_km = effective_speed * hours_elapsed
            new_distance = tel.distance_in_section_km + distance_delta_km

            # Simple linear interpolation along section lat/lon for demo
            section = next((s for s in NDLS_CNB_CORRIDOR_PRESET["sections"] if uuid.UUID(s["id"]) == tel.current_section_id), None)
            if section:
                path = section["geo_path"]
                ratio = min(new_distance / section["length_km"], 1.0)
                start_p = path[0]
                end_p = path[-1]
                new_lat = start_p[0] + (end_p[0] - start_p[0]) * ratio
                new_lon = start_p[1] + (end_p[1] - start_p[1]) * ratio

                # Loop train when section finishes
                if ratio >= 1.0:
                    new_distance = 0.0

                tel.latitude = new_lat
                tel.longitude = new_lon
                tel.distance_in_section_km = new_distance
                tel.speed_kmh = effective_speed
                tel.timestamp = now

                # If disruption is reducing speed, accumulate delay
                if effective_speed < max_speed:
                    tel.delay_minutes += (max_speed - effective_speed) * hours_elapsed * 60.0
                    tel.current_signal_aspect = "YELLOW"
                else:
                    tel.current_signal_aspect = "GREEN"

            updated_list.append(tel)

        return updated_list


simulator_instance = SimulationEngine()
