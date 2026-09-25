"""Test helpers: valid sample instances for every contract."""

from datetime import date, datetime, time, timedelta, timezone

from contracts import (
    Asset,
    BlockCandidate,
    BlockRequest,
    Corridor,
    Defect,
    ExistingBlock,
    GoodsForecast,
    MaintenanceTask,
    Resource,
    TrainMovement,
)

NOW = datetime(2026, 1, 10, 6, 0, tzinfo=timezone.utc)


def sample_asset(**overrides) -> Asset:
    values = dict(
        asset_id="AST-001",
        asset_type="TRACK",
        corridor_id="COR-1",
        section="S1",
        length_metres=1200.0,
        condition_score=0.7,
    )
    values.update(overrides)
    return Asset(**values)


def sample_defect(**overrides) -> Defect:
    values = dict(
        defect_id="DFT-001",
        asset_id="AST-001",
        severity="HIGH",
        description="Rail surface defect",
        detected_at=NOW,
    )
    values.update(overrides)
    return Defect(**values)


def sample_task(**overrides) -> MaintenanceTask:
    values = dict(
        task_id="TSK-001",
        asset_id="AST-001",
        corridor_id="COR-1",
        work_type="PREVENTIVE",
        estimated_duration_minutes=120,
        priority="HIGH",
        required_resources=["MP-01"],
    )
    values.update(overrides)
    return MaintenanceTask(**values)


def sample_block_request(**overrides) -> BlockRequest:
    values = dict(
        request_id="REQ-001",
        task_ids=["TSK-001"],
        corridor_id="COR-1",
        section="S1",
        requested_start=NOW,
        requested_end=NOW + timedelta(hours=3),
    )
    values.update(overrides)
    return BlockRequest(**values)


def sample_corridor(**overrides) -> Corridor:
    values = dict(
        corridor_id="COR-1",
        name="Mumbai-Pune",
        origin_station="Mumbai CSMT",
        destination_station="Pune",
        sections=["S1", "S2"],
    )
    values.update(overrides)
    return Corridor(**values)


def sample_train_movement(**overrides) -> TrainMovement:
    values = dict(
        movement_id="MOV-001",
        train_number="11007",
        corridor_id="COR-1",
        section="S1",
        direction="UP",
        departure=NOW,
        arrival=NOW + timedelta(hours=2),
    )
    values.update(overrides)
    return TrainMovement(**values)


def sample_goods_forecast(**overrides) -> GoodsForecast:
    values = dict(
        forecast_id="FCST-001",
        corridor_id="COR-1",
        section="S1",
        date=date(2026, 1, 11),
        window_start=time(9, 0),
        window_end=time(12, 0),
        probability=0.8,
        volume_tonnes=1200.0,
    )
    values.update(overrides)
    return GoodsForecast(**values)


def sample_resource(**overrides) -> Resource:
    values = dict(
        resource_id="RES-001",
        resource_type="MANPOWER",
        name="Track gang 7",
        capacity=1,
    )
    values.update(overrides)
    return Resource(**values)


def sample_existing_block(**overrides) -> ExistingBlock:
    values = dict(
        block_id="BLK-001",
        corridor_id="COR-1",
        section="S1",
        start_time=NOW,
        end_time=NOW + timedelta(hours=2),
    )
    values.update(overrides)
    return ExistingBlock(**values)


def sample_candidate(**overrides) -> BlockCandidate:
    values = dict(
        candidate_id="C-001",
        task_ids=["TSK-001"],
        corridor_id="COR-1",
        section="S1",
        start_time=NOW,
        end_time=NOW + timedelta(minutes=120),
        total_duration_minutes=120,
        metadata={"required_duration_minutes": 120},
    )
    values.update(overrides)
    return BlockCandidate(**values)


def make_planning_context(**overrides) -> dict:
    """A well-formed context dict for a single corridor / single task world."""
    base = dict(
        horizon_start=NOW,
        horizon_end=NOW + timedelta(days=7),
        tasks=[sample_task()],
        block_requests=[],
        corridors=[sample_corridor()],
        existing_blocks=[],
        train_movements=[],
        goods_forecasts=[],
        resources=[],
        assets=[sample_asset()],
        defects=[],
        priorities=[],
    )
    base.update(overrides)
    return base