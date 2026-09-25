"""Deterministic synthetic demo data generation (Phase 7B).

Every public factory in this module is a *pure function of its ``seed``*:
identical inputs + identical seed produce identical data — same list contents,
same order, same ids, same timestamps. No wall-clock time and no unseeded
randomness are used anywhere.

The produced data is SYNTHETIC_DEMO ONLY. It is fabricated to exercise the
Module 3 pipeline (candidate generation, integrated-block detection, CP-SAT
optimization, validation, metrics, explainability) and is never claimed to be
live Indian Railways data.

Cross-reference rules maintained by the generators:

- tasks reference assets that exist on the same corridor;
- task ``metadata["section"]`` always matches the referenced asset's section;
- asset corridors/sections always exist on the generated corridors;
- resources referenced by tasks exist in the resource catalogue;
- block requests reference existing tasks and use their corridor/section;
- train movements / goods forecasts / existing blocks use real corridor
  sections and well-formed time windows;
- all datetimes are timezone-aware UTC and all windows are end > start.
"""

from datetime import date, datetime, time, timedelta, timezone
from random import Random

from contracts import (
    AIRecommendation,
    Asset,
    AssetType,
    BlockRequest,
    BlockStatus,
    Corridor,
    Defect,
    ExistingBlock,
    GoodsForecast,
    MaintenanceTask,
    OccupancyType,
    PriorityLevel,
    Resource,
    ResourceType,
    SeverityLevel,
    TrainDirection,
    TrainMovement,
    WorkType,
)

from .constants import (
    DEMO_GENERATED_AT,
    DEMO_HORIZON_DAYS,
    DEMO_HORIZON_END,
    DEMO_HORIZON_START,
    DEPARTMENT_ENGINEERING,
    DEPARTMENT_SIGNALLING_TELECOMMUNICATION,
    DEPARTMENT_TRACTION_DISTRIBUTION,
)

# ------------------------------------------------------------------ constants

#: Asset-type cycle used so every department is represented in the dataset.
_ASSET_TYPE_CYCLE = [
    AssetType.TRACK,
    AssetType.OHE,
    AssetType.SIGNALLING,
    AssetType.TRACK,
    AssetType.OHE,
    AssetType.SIGNALLING,
    AssetType.BRIDGE,
    AssetType.STATION,
]

_DEPARTMENT_BY_ASSET_TYPE = {
    AssetType.TRACK: DEPARTMENT_ENGINEERING,
    AssetType.BRIDGE: DEPARTMENT_ENGINEERING,
    AssetType.TUNNEL: DEPARTMENT_ENGINEERING,
    AssetType.STATION: DEPARTMENT_ENGINEERING,
    AssetType.OTHER: DEPARTMENT_ENGINEERING,
    AssetType.OHE: DEPARTMENT_TRACTION_DISTRIBUTION,
    AssetType.SIGNALLING: DEPARTMENT_SIGNALLING_TELECOMMUNICATION,
}

#: Task indices that are deliberately URGENT. Their corridor indices are all
#: < 10 so they stay clear of the train/goods heavy corridors (11-20) and the
#: resource-constrained tasks, keeping the urgent set schedulable.
URGENT_TASK_INDICES = frozenset({1, 3, 5, 7, 9})

_WORK_TYPE_CYCLE = [
    WorkType.PREVENTIVE,
    WorkType.INSPECTION,
    WorkType.CORRECTIVE,
    WorkType.REPAIR,
    WorkType.PREVENTIVE,
    WorkType.REPLACEMENT,
]

_DURATION_PALETTE = [30, 45, 60, 60, 90, 120, 150, 180]

_SECTION_COUNT_PALETTE = [2, 2, 3]

_TRAIN_CORRIDOR_OFFSET = 10  # trains live on corridors index 10..19
_GOODS_CORRIDOR_OFFSET = 12  # goods forecasts live on corridors index 12..19
_EXISTING_BLOCK_CORRIDOR_OFFSET = 12  # existing blocks on index 12..15

_CORRIDOR_NAMES = [
    f"SYNTHETIC Corridor {corridor:02d}"
    for corridor in range(1, 21)
]
_ORIGIN_STATIONS = [f"Synthetic Origin {corridor:02d}" for corridor in range(1, 21)]
_DEST_STATIONS = [f"Synthetic Destination {corridor:02d}" for corridor in range(1, 21)]


# ---------------------------------------------------------------- determinism

def _child_seed(seed: int, salt: int) -> int:
    """Derive a per-generator seed from the public ``seed`` argument.

    Keeps the families of data independent while remaining a pure function of
    the public seed (all salts are fixed constants).
    """
    return (seed * 100_003 + salt * 7919) & 0x7FFFFFFF


def deterministic_rng(seed: int) -> Random:
    """A `random.Random` seeded deterministically from ``seed``."""
    return Random(seed)


# ------------------------------------------------------------------ corridors

def create_demo_corridors(seed: int = 0) -> list[Corridor]:
    """20 deterministic corridors with 2-3 sections each."""
    rng = Random(_child_seed(seed, 1))
    corridors: list[Corridor] = []
    for index in range(20):
        corridor_id = f"COR-{index + 1:03d}"
        section_count = _SECTION_COUNT_PALETTE[(index + rng.randrange(0, 3)) % 3]
        sections = [f"{corridor_id}-S{number}" for number in range(1, section_count + 1)]
        corridors.append(
            Corridor(
                corridor_id=corridor_id,
                name=_CORRIDOR_NAMES[index],
                origin_station=_ORIGIN_STATIONS[index],
                destination_station=_DEST_STATIONS[index],
                sections=sections,
                gauge="broad",
                electrified=True,
                max_speed_kmph=round(100.0 + index * 4.0, 1),
            )
        )
    return corridors


# --------------------------------------------------------------------- assets

def create_demo_assets(seed: int = 0) -> list[Asset]:
    """50 deterministic assets spread across the corridors."""
    corridors = create_demo_corridors(seed)
    assets: list[Asset] = []
    for index in range(50):
        corridor = corridors[index % len(corridors)]
        section = corridor.sections[(index // len(corridors)) % len(corridor.sections)]
        asset_type = _ASSET_TYPE_CYCLE[index % len(_ASSET_TYPE_CYCLE)]
        assets.append(
            Asset(
                asset_id=f"AST-{index + 1:03d}",
                asset_type=asset_type,
                corridor_id=corridor.corridor_id,
                section=section,
                track_id=f"TRK-{index + 1:03d}",
                length_metres=round(400.0 + (index % 25) * 40.0, 1),
                electrified=True,
                condition_score=round(0.25 + (index % 45) / 100.0, 2),
                metadata={"synthetic": True, "demo": True},
            )
        )
    return assets


# -------------------------------------------------------------------- defects

def create_demo_defects(seed: int = 0) -> list[Defect]:
    """50 deterministic defects linked to the demo assets."""
    rng = Random(_child_seed(seed, 2))
    assets = create_demo_assets(seed)
    severities = [
        SeverityLevel.LOW,
        SeverityLevel.MEDIUM,
        SeverityLevel.MEDIUM,
        SeverityLevel.HIGH,
        SeverityLevel.HIGH,
        SeverityLevel.CRITICAL,
    ]
    defects: list[Defect] = []
    for index in range(50):
        asset = assets[index % len(assets)]
        severity = severities[(index + rng.randrange(0, 2)) % len(severities)]
        detected_at = DEMO_HORIZON_START - timedelta(days=1 + (index % 5))
        defects.append(
            Defect(
                defect_id=f"DFT-{index + 1:03d}",
                asset_id=asset.asset_id,
                severity=severity,
                description=f"SYNTHETIC_DEMO defect {index + 1:03d} on {asset.asset_id} "
                f"({severity.value})",
                detected_at=detected_at,
                detected_by="SYNTHETIC_DEMO system",
                recommended_window_days=3 + (index % 7),
            )
        )
    return defects


# ------------------------------------------------------------------- resources

def create_demo_resources(seed: int = 0) -> list[Resource]:
    """30 deterministic resources.

    RES-030 carries a restricted availability window so a small fraction of
    resource-heavy demo candidates exercises RESOURCE_CONFLICT.
    """
    resource_types = [
        ResourceType.MANPOWER,
        ResourceType.MACHINERY,
        ResourceType.ENGINEERING_TRAIN,
        ResourceType.MATERIAL,
        ResourceType.POSSESSION,
    ]
    resources: list[Resource] = []
    for index in range(30):
        resource_id = f"RES-{index + 1:03d}"
        capacity = 2 if index % 10 == 4 else 1
        available_from = None
        available_until = None
        if index == 29:
            available_from = DEMO_HORIZON_START + timedelta(days=2, hours=8)
            available_until = DEMO_HORIZON_START + timedelta(days=5, hours=18)
        resources.append(
            Resource(
                resource_id=resource_id,
                resource_type=resource_types[index % len(resource_types)],
                name=f"SYNTHETIC_DEMO {resource_types[index % len(resource_types)].value} "
                f"resource {index + 1:03d}",
                capacity=capacity,
                available_from=available_from,
                available_until=available_until,
                attributes={"synthetic": True, "demo": True},
            )
        )
    return resources


# ----------------------------------------------------------------------- tasks

def department_for_asset_type(asset_type: AssetType) -> str:
    """The owning department for an asset type (never blocks integration)."""
    return _DEPARTMENT_BY_ASSET_TYPE.get(asset_type, DEPARTMENT_ENGINEERING)


def task_window(index: int) -> tuple[datetime, datetime]:
    """Deterministic daytime task window inside the demo horizon."""
    day = index % DEMO_HORIZON_DAYS
    start = DEMO_HORIZON_START + timedelta(
        days=day,
        hours=8 + (index % 8),
        minutes=(index % 2) * 30,
    )
    return start


def create_demo_tasks(seed: int = 0) -> list[MaintenanceTask]:
    """100 deterministic maintenance tasks across all three departments."""
    assets = create_demo_assets(seed)
    corridors = create_demo_corridors(seed)
    resources = create_demo_resources(seed)
    corridor_ids = {corridor.corridor_id for corridor in corridors}

    tasks: list[MaintenanceTask] = []
    for index in range(100):
        asset = assets[index % len(assets)]
        corridor_id = asset.corridor_id
        if corridor_id not in corridor_ids:  # pragma: no cover - defensive
            raise ValueError(f"asset '{asset.asset_id}' references unknown corridor {corridor_id}")

        department = department_for_asset_type(asset.asset_type)
        corridor_index = int(corridor_id.rsplit("-", 1)[1]) - 1
        priority = _priority_for_index(index)
        work_type = _WORK_TYPE_CYCLE[index % len(_WORK_TYPE_CYCLE)]
        duration = _DURATION_PALETTE[index % len(_DURATION_PALETTE)]

        start = task_window(index)
        slack = 60 + (index % 3) * 60
        end = start + timedelta(minutes=duration + slack)

        # Resource-heavy tasks live on the train/goods heavy corridors (11-20).
        required_resources: list[str] = []
        if corridor_index >= 10:
            required_resources = [resources[(index * 7) % len(resources)].resource_id]

        due_by: date | None = None
        if index % 10 == 0:
            due_by = (DEMO_HORIZON_START - timedelta(days=1 + (index % 3))).date()

        tasks.append(
            MaintenanceTask(
                task_id=f"TSK-{index + 1:03d}",
                asset_id=asset.asset_id,
                corridor_id=corridor_id,
                work_type=work_type,
                estimated_duration_minutes=duration,
                priority=priority,
                department=department,
                required_resources=required_resources,
                required_track_slots=1,
                window_start=start,
                window_end=end,
                due_by=due_by,
                description=f"SYNTHETIC_DEMO {department} task {index + 1:03d}",
                metadata={"section": asset.section, "synthetic": True, "demo": True},
            )
        )
    return tasks


def _priority_for_index(index: int) -> PriorityLevel:
    if index in URGENT_TASK_INDICES:
        return PriorityLevel.URGENT
    if index % 5 == 0:
        return PriorityLevel.HIGH
    if index % 3 == 0:
        return PriorityLevel.MEDIUM
    return PriorityLevel.LOW


# ------------------------------------------------------------ block requests

def create_demo_block_requests(seed: int = 0) -> list[BlockRequest]:
    """100 deterministic block requests (one per task)."""
    tasks = create_demo_tasks(seed)
    requests: list[BlockRequest] = []
    for task in tasks:
        requests.append(
            BlockRequest(
                request_id=f"BRQ-{task.task_id}",
                task_ids=[task.task_id],
                corridor_id=task.corridor_id,
                section=task.metadata["section"],
                requested_start=task.window_start,
                requested_end=task.window_end,
                occupancy_type=OccupancyType.TRAFFIC_BLOCK,
                notes="SYNTHETIC_DEMO block request",
            )
        )
    return requests


# ---------------------------------------------------------------- train moves

def create_demo_trains(seed: int = 0) -> list[TrainMovement]:
    """100 deterministic protected train movements on corridors 11-20."""
    corridors = create_demo_corridors(seed)
    trains: list[TrainMovement] = []
    for index in range(100):
        corridor = corridors[_TRAIN_CORRIDOR_OFFSET + (index % 10)]
        section = corridor.sections[index % len(corridor.sections)]
        departure = DEMO_HORIZON_START + timedelta(
            days=index % DEMO_HORIZON_DAYS,
            hours=6 + (index * 3) % 12,
            minutes=(index % 4) * 15,
        )
        arrival = departure + timedelta(minutes=40 + (index % 3) * 25)
        trains.append(
            TrainMovement(
                movement_id=f"MOV-{index + 1:03d}",
                train_number=f"{12000 + index}",
                corridor_id=corridor.corridor_id,
                section=section,
                direction=TrainDirection.UP if index % 2 == 0 else TrainDirection.DOWN,
                departure=departure,
                arrival=arrival,
                stops=[corridor.origin_station, corridor.destination_station],
                frequency="DAILY",
            )
        )
    return trains


# ------------------------------------------------------------- goods forecasts

def create_demo_goods_forecasts(seed: int = 0) -> list[GoodsForecast]:
    """50 deterministic goods forecasts on corridors 13-20.

    Probabilities are chosen against the CONFIGURED thresholds
    (min = 0.60, peak = 0.85): night windows carry peak probability (blocking)
    and daytime windows carry elevated probability (advisory) so the live demo
    shows both GOODS_CONFLICT severities without destroying schedulability.
    """
    corridors = create_demo_corridors(seed)
    forecasts: list[GoodsForecast] = []
    for index in range(50):
        corridor = corridors[_GOODS_CORRIDOR_OFFSET + (index % 8)]
        section = corridor.sections[index % len(corridor.sections)]
        day = index % DEMO_HORIZON_DAYS
        kind = index % 4
        if kind == 0:  # night peak -> blocking GOODS_CONFLICT
            window_start, window_end, probability = time(22, 0), time(23, 30), 0.90
        elif kind == 1:  # early morning lower
            window_start, window_end, probability = time(0, 30), time(5, 0), 0.72
        elif kind == 2:  # daytime elevated -> advisory GOODS_CONFLICT
            window_start, window_end, probability = time(9, 0), time(12, 0), 0.70
        else:  # late evening lower
            window_start, window_end, probability = time(21, 0), time(23, 0), 0.66
        forecast_date = DEMO_HORIZON_START.date() + timedelta(days=day)
        forecasts.append(
            GoodsForecast(
                forecast_id=f"FCST-{index + 1:03d}",
                corridor_id=corridor.corridor_id,
                section=section,
                date=forecast_date,
                window_start=window_start,
                window_end=window_end,
                probability=probability,
                volume_tonnes=round(800.0 + (index % 20) * 60.0, 1),
                generated_at=DEMO_GENERATED_AT,
            )
        )
    return forecasts


# ------------------------------------------------------------ existing blocks

def create_demo_existing_blocks(seed: int = 0) -> list[ExistingBlock]:
    """4 deterministic APPROVED existing blocks on corridors 13-16."""
    corridors = create_demo_corridors(seed)
    blocks: list[ExistingBlock] = []
    for index in range(4):
        corridor = corridors[_EXISTING_BLOCK_CORRIDOR_OFFSET + index]
        section = corridor.sections[0]
        start = DEMO_HORIZON_START + timedelta(
            days=index % DEMO_HORIZON_DAYS,
            hours=21 + index % 2,
            minutes=(index % 2) * 30,
        )
        end = start + timedelta(hours=2)
        blocks.append(
            ExistingBlock(
                block_id=f"BLK-{index + 1:03d}",
                corridor_id=corridor.corridor_id,
                section=section,
                start_time=start,
                end_time=end,
                occupancy_type=OccupancyType.TRAFFIC_BLOCK,
                status=BlockStatus.APPROVED,
                related_task_ids=[],
            )
        )
    return blocks


# ---------------------------------------------------------------- priorities

def create_demo_priorities(seed: int = 0) -> list[AIRecommendation]:
    """Deterministic Module 2 style priority recommendations for ~20 tasks.

    ``priority_score`` (0..100) drives objective term; the score is a pure
    function of the task index.
    """
    tasks = create_demo_tasks(seed)
    recommendations: list[AIRecommendation] = []
    for task in tasks:
        task_number = int(task.task_id.rsplit("-", 1)[1])
        if task_number % 5 != 0:
            continue
        score = float(30 + (task_number * 13) % 70)
        level = _priority_level_from_score(score)
        recommendations.append(
            AIRecommendation(
                task_id=task.task_id,
                priority_score=score,
                recommended_priority=level,
                confidence=round(0.6 + (task_number % 4) * 0.1, 2),
                rationale="SYNTHETIC_DEMO deterministic priority; not live IR data",
                model_version="synthetic-demo-1.0",
            )
        )
    return recommendations


def _priority_level_from_score(score: float) -> PriorityLevel:
    if score >= 85:
        return PriorityLevel.URGENT
    if score >= 70:
        return PriorityLevel.HIGH
    if score >= 50:
        return PriorityLevel.MEDIUM
    return PriorityLevel.LOW


# ------------------------------------------------------------------- helpers

def corridor_index(corridor_id: str) -> int:
    """0-based index of a ``COR-{n}`` corridor id."""
    return int(corridor_id.rsplit("-", 1)[1]) - 1


__all__ = [
    "URGENT_TASK_INDICES",
    "corridor_index",
    "create_demo_assets",
    "create_demo_block_requests",
    "create_demo_corridors",
    "create_demo_defects",
    "create_demo_existing_blocks",
    "create_demo_goods_forecasts",
    "create_demo_priorities",
    "create_demo_resources",
    "create_demo_tasks",
    "create_demo_trains",
    "department_for_asset_type",
    "deterministic_rng",
    "task_window",
]