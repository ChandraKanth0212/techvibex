import uuid
from datetime import datetime, timezone
from typing import Dict, List
from railopt_contracts import NetworkStateSnapshot, LiveTelemetryEntity, DisruptionEntity
from src.synthetic.simulator import simulator_instance


class SnapshotService:
    """Service to aggregate live operational network state into canonical NetworkStateSnapshot."""

    @staticmethod
    async def get_current_snapshot() -> NetworkStateSnapshot:
        now = datetime.now(timezone.utc)
        active_trains: List[LiveTelemetryEntity] = list(simulator_instance.active_telemetry.values())
        active_disruptions: List[DisruptionEntity] = simulator_instance.active_disruptions

        # Compute section occupancies
        section_occupancies: Dict[str, List[str]] = {}
        signal_states: Dict[str, str] = {}

        for train in active_trains:
            sec_id = str(train.current_section_id) if train.current_section_id else "UNASSIGNED"
            if sec_id not in section_occupancies:
                section_occupancies[sec_id] = []
            section_occupancies[sec_id].append(train.train_number)

            sig_key = f"SIG_{train.train_number}"
            signal_states[sig_key] = train.current_signal_aspect

        return NetworkStateSnapshot(
            snapshot_id=uuid.uuid4(),
            timestamp=now,
            active_trains=active_trains,
            active_disruptions=active_disruptions,
            section_occupancies=section_occupancies,
            signal_states=signal_states
        )
