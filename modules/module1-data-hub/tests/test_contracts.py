import uuid
from datetime import datetime, timezone
from railopt_contracts import (
    TrainEntity, TrainType, TrainPriority,
    StationEntity, TrackSectionEntity, LiveTelemetryEntity,
    NetworkStateSnapshot
)


def test_train_entity_validation():
    t_id = uuid.uuid4()
    train = TrainEntity(
        train_id=t_id,
        train_number="12951",
        train_name="Mumbai Rajdhani",
        train_type=TrainType.PASSENGER,
        priority=TrainPriority.PRIORITY_1,
        max_speed_kmh=130.0
    )
    assert train.train_number == "12951"
    assert train.priority == TrainPriority.PRIORITY_1


def test_network_state_snapshot_contract():
    t_id = uuid.uuid4()
    telemetry = LiveTelemetryEntity(
        telemetry_id=uuid.uuid4(),
        train_id=t_id,
        train_number="12951",
        timestamp=datetime.now(timezone.utc),
        latitude=28.6430,
        longitude=77.2194,
        speed_kmh=110.0
    )
    snapshot = NetworkStateSnapshot(
        snapshot_id=uuid.uuid4(),
        timestamp=datetime.now(timezone.utc),
        active_trains=[telemetry],
        active_disruptions=[],
        section_occupancies={"SEC_NDLS_ALJN": ["12951"]},
        signal_states={"SIG_12951": "GREEN"}
    )
    assert len(snapshot.active_trains) == 1
    assert snapshot.section_occupancies["SEC_NDLS_ALJN"] == ["12951"]
