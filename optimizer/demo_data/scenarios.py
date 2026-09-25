"""End-to-end demo scenarios (Phase 7B).

Each :class:`DemoScenario` is a small, fully deterministic planning world that
trains a specific property of the Module 3 pipeline. Scenarios are DATA ONLY:
they build contexts/requests and document what the pipeline is expected to show;
the actual pipeline execution happens in the test suite and the demo scripts.

Scenarios catalogue (A-J):

- **A - 3-department integrated block**: three tasks (Engineering, Traction
  Distribution, Signal & Telecommunication) on the same corridor+section with a
  common window -> one INTEGRATED block opportunity. Selecting it over three
  separate blocks requires a positive ``slot_consolidation`` weight, so the
  pipeline demo/tests use ``objective_weights.slot_consolidation = 2.0``.
- **B - 2-department consolidation**: two departments share one possession.
- **C - goods forecasts**: elevated window yields an advisory ``GOODS_CONFLICT``
  WARNING (candidate stays feasible); a peak window yields an ERROR rejection.
- **D - protected train movement**: task window fully covered by a protected
  train -> every candidate rejected with ``TRAIN_CONFLICT``.
- **E - existing approved block**: window overlaps an APPROVED block on the same
  section -> every candidate rejected with ``EXISTING_BLOCK_CONFLICT``.
- **F - no common integrated window**: two tasks on the same section with
  disjoint windows -> the detector emits NO group for them; an individual task
  whose window is shorter than its duration demonstrates ``DURATION_CONFLICT``
  through the candidate generator.
- **G - shared capacity-1 resource**: one resource available 10:00-13:00 with
  two 120-minute tasks -> early starts are rejected (``RESOURCE_CONFLICT``) and
  only one of the two can be scheduled.
- **H - dependency metadata (UNSUPPORTED)**: task carries ``depends_on``
  metadata; the schemas have no dependency fields, so ``DEPENDENCY_CONFLICT``
  stays documented-but-never-emitted.
- **I - replanning fixtures (documentation only)**: two snapshots (original /
  replanned) with a described delta; real dynamic replanning is out of phase.
- **J - mixed feasibility smoke world**: feasible and hard-rejected tasks in one
  context drive a full pipeline run whose schedule validates cleanly.

All times are UTC; all scenarios are self-contained (no dependency on the demo
dataset catalogue).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from typing import Any

from app.core.context import PlanningContext
from contracts import (
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
    TrainDirection,
    TrainMovement,
    WorkType,
)

#: Time anchor (UTC) from which every scenario date is derived.
SCENARIO_ANCHOR = datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc)

#: Scenario identifiers in stable order.
SCENARIO_IDS = [
    "scenario_a",
    "scenario_b",
    "scenario_c",
    "scenario_d",
    "scenario_e",
    "scenario_f",
    "scenario_g",
    "scenario_h",
    "scenario_i",
    "scenario_j",
]


@dataclass
class DemoScenario:
    """A deterministic, self-contained planning world + its expectations."""

    scenario_id: str
    name: str
    description: str
    context: PlanningContext
    request: BlockRequest | None = None
    note: str = ""
    expected: dict[str, Any] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)

    def describe(self) -> str:
        """One-line summary used by the demo runner."""
        return f"[{self.scenario_id}] {self.name}: {self.description}"


# ------------------------------------------------------------------- builders

_COLORS = {"S1", "S2", "S3"}


def _corridor(corridor_id: str, sections: tuple[str, ...] = ("S1", "S2")) -> Corridor:
    return Corridor(
        corridor_id=corridor_id,
        name=f"Synthetic Demo {corridor_id}",
        origin_station=f"{corridor_id} Origin",
        destination_station=f"{corridor_id} Destination",
        sections=list(sections),
    )


def _task(
    task_id: str,
    corridor_id: str,
    section: str,
    start: datetime,
    end: datetime,
    duration_minutes: int,
    priority: PriorityLevel = PriorityLevel.MEDIUM,
    department: str | None = None,
    asset_type: AssetType = AssetType.TRACK,
    work_type: WorkType = WorkType.PREVENTIVE,
    required_resources: list[str] | None = None,
    self_delay_note: str = "",
    **metadata_extra: Any,
) -> MaintenanceTask:
    metadata: dict[str, Any] = {"section": section, "synthetic": True, "demo": True}
    metadata.update(metadata_extra)
    description = f"SYNTHETIC_DEMO {department or 'Maintenance'} task {task_id} on {section}"
    if self_delay_note:
        description += f" ({self_delay_note})"
    return MaintenanceTask(
        task_id=task_id,
        asset_id=f"AST-{task_id}",
        corridor_id=corridor_id,
        work_type=work_type,
        estimated_duration_minutes=duration_minutes,
        priority=priority,
        department=department,
        required_resources=required_resources or [],
        window_start=start,
        window_end=end,
        description=description,
        metadata=metadata,
    )


def _asset(task: MaintenanceTask) -> Asset:
    return Asset(
        asset_id=task.asset_id,
        asset_type=_asset_type_for(task),
        corridor_id=task.corridor_id,
        section=task.metadata["section"],
        electrified=True,
        condition_score=0.5,
    )


def _asset_type_for(task: MaintenanceTask) -> AssetType:
    mapping = {"Engineering": AssetType.TRACK, "Traction Distribution": AssetType.OHE}
    if task.department in mapping:
        return mapping[task.department]
    if task.work_type == WorkType.REPAIR:
        return AssetType.TRACK
    return AssetType.SIGNALLING


def _request(request_id: str, tasks: list[MaintenanceTask], section: str) -> BlockRequest:
    first = tasks[0]
    return BlockRequest(
        request_id=request_id,
        task_ids=[task.task_id for task in tasks],
        corridor_id=first.corridor_id,
        section=section,
        requested_start=first.window_start,
        requested_end=first.window_end,
        notes="SYNTHETIC_DEMO scenario block request",
    )


def _horizon(context: PlanningContext, margin_days: int = 1) -> PlanningContext:
    starts = [t.window_start for t in context.tasks]
    ends = [t.window_end for t in context.tasks]
    return context.model_copy(
        update={
            "horizon_start": min(starts) - timedelta(days=margin_days),
            "horizon_end": max(ends) + timedelta(days=margin_days),
        }
    )


def _scenario(
    scenario_id: str,
    name: str,
    description: str,
    context: PlanningContext,
    request: BlockRequest | None = None,
    note: str = "",
    expected: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> DemoScenario:
    return DemoScenario(
        scenario_id=scenario_id,
        name=name,
        description=description,
        context=context,
        request=request,
        note=note,
        expected=expected or {},
        extra=extra or {},
    )


# ------------------------------------------------------------------- scenario A

def build_scenario_a() -> DemoScenario:
    corridor = _corridor("COR-A")
    section = "S1"
    day = SCENARIO_ANCHOR
    tasks = [
        _task("T-A01", "COR-A", section, day + timedelta(hours=8), day + timedelta(hours=16), 60,
              department="Engineering", asset_type=AssetType.TRACK),
        _task("T-A02", "COR-A", section, day + timedelta(hours=8), day + timedelta(hours=16), 60,
              department="Traction Distribution", asset_type=AssetType.OHE),
        _task("T-A03", "COR-A", section, day + timedelta(hours=8), day + timedelta(hours=16), 60,
              department="Signal & Telecommunication",
              asset_type=AssetType.SIGNALLING, work_type=WorkType.REPAIR),
    ]
    assets = [_asset(task) for task in tasks]
    requests = [_request(f"BRQ-{task.task_id}", [task], section) for task in tasks]
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=assets,
        tasks=tasks,
        block_requests=requests,
    ))
    request = _request("BRQ-A01", tasks, section)
    return _scenario(
        "scenario_a",
        "3-department integrated block",
        "Engineering + Traction Distribution + Signal & Telecommunication share one "
        "possession; detect a size-3 compatible integrated block (select it with "
        "slot_consolidation weighting).",
        context,
        request,
        note=(
            "At default objective weights the integrated value ties the sum of the "
            "component singles, so the demo uses `slot_consolidation=2.0` to break the "
            "tie toward consolidation."
        ),
        expected={"group_size": 3, "departments": 3, "requires_slot_boost": True},
    )


# ------------------------------------------------------------------- scenario B

def build_scenario_b() -> DemoScenario:
    corridor = _corridor("COR-B")
    section = "S1"
    day = SCENARIO_ANCHOR + timedelta(days=1)
    tasks = [
        _task("T-B01", "COR-B", section, day + timedelta(hours=9), day + timedelta(hours=17), 90,
              department="Engineering", asset_type=AssetType.TRACK),
        _task("T-B02", "COR-B", section, day + timedelta(hours=9), day + timedelta(hours=17), 120,
              department="Traction Distribution", asset_type=AssetType.OHE,
              work_type=WorkType.CORRECTIVE),
    ]
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(task) for task in tasks],
        tasks=tasks,
        block_requests=[_request(f"BRQ-{task.task_id}", [task], section) for task in tasks],
    ))
    return _scenario(
        "scenario_b",
        "2-department consolidation",
        "Two departments share one integrated possession window instead of two.",
        context,
        _request("BRQ-B01", tasks, section),
        note="shared_possession_minutes = total sequential duration (210 min).",
        expected={"group_size": 2, "departments": 2},
    )


# ------------------------------------------------------------------- scenario C

def build_scenario_c() -> DemoScenario:
    corridor = _corridor("COR-C")
    section = "S1"
    day1 = SCENARIO_ANCHOR + timedelta(days=2)
    forecast_advisory = GoodsForecast(
        forecast_id="FCST-C01",
        corridor_id="COR-C",
        section=section,
        date=day1.date(),
        window_start=time(9, 30),
        window_end=time(10, 30),
        probability=0.70,
        volume_tonnes=1200.0,
    )
    task_advisory = _task(
        "T-C01", "COR-C", section,
        day1 + timedelta(hours=9), day1 + timedelta(hours=11), 90,
        department="Engineering", asset_type=AssetType.TRACK,
    )
    day2 = day1 + timedelta(days=1)
    forecast_peak = GoodsForecast(
        forecast_id="FCST-C02",
        corridor_id="COR-C",
        section=section,
        date=day2.date(),
        window_start=time(10, 0),
        window_end=time(11, 0),
        probability=0.90,
        volume_tonnes=1800.0,
    )
    task_peak = _task(
        "T-C02", "COR-C", section,
        day2 + timedelta(hours=10), day2 + timedelta(hours=11), 60,
        department="Traction Distribution", asset_type=AssetType.OHE,
        work_type=WorkType.REPAIR,
    )
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(task_advisory), _asset(task_peak)],
        tasks=[task_advisory, task_peak],
        block_requests=[
            _request(f"BRQ-{task_advisory.task_id}", [task_advisory], section),
            _request(f"BRQ-{task_peak.task_id}", [task_peak], section),
        ],
        goods_forecasts=[forecast_advisory, forecast_peak],
    ))
    return _scenario(
        "scenario_c",
        "goods forecast advisory vs peak",
        "Elevated probability -> advisory GOODS_CONFLICT WARNING (still feasible); "
        "peak probability -> ERROR GOODS_CONFLICT rejection.",
        context,
        note="advisory task keeps feasible candidates; peak task candidates are rejected.",
        expected={
            "advisory_code": "GOODS_CONFLICT",
            "advisory_feasible": True,
            "peak_code": "GOODS_CONFLICT",
            "peak_feasible": False,
        },
    )


# ------------------------------------------------------------------- scenario D

def build_scenario_d() -> DemoScenario:
    corridor = _corridor("COR-D")
    section = "S1"
    day = SCENARIO_ANCHOR + timedelta(days=3)
    task = _task(
        "T-D01", "COR-D", section,
        day + timedelta(hours=9), day + timedelta(hours=11), 60,
        department="Engineering", asset_type=AssetType.TRACK,
    )
    movement = TrainMovement(
        movement_id="MOV-D01",
        train_number="20001",
        corridor_id="COR-D",
        section=section,
        direction=TrainDirection.UP,
        departure=day + timedelta(hours=9, minutes=20),
        arrival=day + timedelta(hours=10, minutes=20),
    )
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(task)],
        tasks=[task],
        block_requests=[_request(f"BRQ-{task.task_id}", [task], section)],
        train_movements=[movement],
    ))
    return _scenario(
        "scenario_d",
        "protected train movement",
        "Task window is fully covered by a protected train (with safety buffer), so "
        "every candidate placement is rejected with TRAIN_CONFLICT.",
        context,
        _request("BRQ-D01", [task], section),
        note="rejection is per-candidate; the optimizer reports the task unschedulable.",
        expected={"code": "TRAIN_CONFLICT", "feasible_candidates": 0},
    )


# ------------------------------------------------------------------- scenario E

def build_scenario_e() -> DemoScenario:
    corridor = _corridor("COR-E")
    section = "S1"
    day = SCENARIO_ANCHOR + timedelta(days=4)
    task = _task(
        "T-E01", "COR-E", section,
        day + timedelta(hours=9), day + timedelta(hours=11), 60,
        department="Signal & Telecommunication",
        asset_type=AssetType.SIGNALLING, work_type=WorkType.REPAIR,
    )
    existing = ExistingBlock(
        block_id="BLK-E01",
        corridor_id="COR-E",
        section=section,
        start_time=day + timedelta(hours=9),
        end_time=day + timedelta(hours=11),
        occupancy_type=OccupancyType.TRAFFIC_BLOCK,
        status=BlockStatus.APPROVED,
    )
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(task)],
        tasks=[task],
        block_requests=[_request(f"BRQ-{task.task_id}", [task], section)],
        existing_blocks=[existing],
    ))
    return _scenario(
        "scenario_e",
        "existing approved block",
        "Task window overlaps an already-approved block on the same section; all "
        "candidates rejected with EXISTING_BLOCK_CONFLICT.",
        context,
        _request("BRQ-E01", [task], section),
        expected={"code": "EXISTING_BLOCK_CONFLICT", "feasible_candidates": 0},
    )


# ------------------------------------------------------------------- scenario F

def build_scenario_f() -> DemoScenario:
    corridor = _corridor("COR-F", sections=("S1", "S2"))
    section = "S1"
    day = SCENARIO_ANCHOR + timedelta(days=5)
    task_a = _task(
        "T-F01", "COR-F", section,
        day + timedelta(hours=8), day + timedelta(hours=10), 60,
        department="Engineering", asset_type=AssetType.TRACK,
    )
    task_b = _task(
        "T-F02", "COR-F", section,
        day + timedelta(hours=14), day + timedelta(hours=16), 60,
        department="Traction Distribution", asset_type=AssetType.OHE,
    )
    task_short = _task(
        "T-F03", "COR-F", "S2",
        day + timedelta(hours=8), day + timedelta(hours=8, minutes=30), 90,
        department="Signal & Telecommunication",
        asset_type=AssetType.SIGNALLING, work_type=WorkType.CORRECTIVE,
        self_delay_note="window shorter than duration",
    )
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(task_a), _asset(task_b), _asset(task_short)],
        tasks=[task_a, task_b, task_short],
        block_requests=[
            _request(f"BRQ-{task_a.task_id}", [task_a], section),
            _request(f"BRQ-{task_b.task_id}", [task_b], section),
            _request(f"BRQ-{task_short.task_id}", [task_short], "S2"),
        ],
    ))
    return _scenario(
        "scenario_f",
        "no common integrated window",
        "Two tasks on the same section with disjoint windows -> the detector emits "
        "no group containing both; a short-window task demonstrates DURATION_CONFLICT "
        "through the candidate generator.",
        context,
        note="DURATION_CONFLICT surfaces only from the candidate generator, not the detector.",
        expected={
            "no_common_group": True,
            "code": "DURATION_CONFLICT",
            "short_task_id": task_short.task_id,
        },
    )


# ------------------------------------------------------------------- scenario G

def build_scenario_g() -> DemoScenario:
    corridor = _corridor("COR-G")
    section = "S1"
    day = SCENARIO_ANCHOR + timedelta(days=6)
    resource = Resource(
        resource_id="RES-G01",
        resource_type=ResourceType.MACHINERY,
        name="Synthetic Demo rollers-set",
        capacity=1,
        available_from=day + timedelta(hours=10),
        available_until=day + timedelta(hours=13),
    )
    window_start = day + timedelta(hours=9, minutes=30)
    window_end = day + timedelta(hours=13)
    task_high = _task(
        "T-G01", "COR-G", section, window_start, window_end, 120,
        priority=PriorityLevel.HIGH,
        department="Engineering", asset_type=AssetType.TRACK,
        required_resources=[resource.resource_id],
    )
    task_med = _task(
        "T-G02", "COR-G", section, window_start, window_end, 120,
        priority=PriorityLevel.MEDIUM,
        department="Traction Distribution", asset_type=AssetType.OHE,
        required_resources=[resource.resource_id],
    )
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(task_high), _asset(task_med)],
        tasks=[task_high, task_med],
        block_requests=[
            _request(f"BRQ-{task_high.task_id}", [task_high], section),
            _request(f"BRQ-{task_med.task_id}", [task_med], section),
        ],
        resources=[resource],
    ))
    return _scenario(
        "scenario_g",
        "shared capacity-1 resource",
        "One resource available 10:00-13:00 shared by two 120-minute tasks; the "
        "09:30 placements are rejected (RESOURCE_CONFLICT) and only one of the two "
        "can be scheduled.",
        context,
        _request("BRQ-G01", [task_high, task_med], section),
        expected={
            "code": "RESOURCE_CONFLICT",
            "resource_id": resource.resource_id,
            "scheduled_at_most_one": True,
        },
    )


# ------------------------------------------------------------------- scenario H

def build_scenario_h() -> DemoScenario:
    corridor = _corridor("COR-H")
    section = "S1"
    day = SCENARIO_ANCHOR + timedelta(days=7)
    prerequisites = [_task(
        "T-H01", "COR-H", section,
        day + timedelta(hours=8), day + timedelta(hours=10), 60,
        department="Engineering", asset_type=AssetType.TRACK,
    )]
    dependent = _task(
        "T-H02", "COR-H", section,
        day + timedelta(hours=11), day + timedelta(hours=13), 60,
        department="Traction Distribution", asset_type=AssetType.OHE,
        depends_on=["T-H01"],
    )
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(prerequisites[0]), _asset(dependent)],
        tasks=[prerequisites[0], dependent],
        block_requests=[
            _request(f"BRQ-{prerequisites[0].task_id}", prerequisites, section),
            _request(f"BRQ-{dependent.task_id}", [dependent], section),
        ],
    ))
    return _scenario(
        "scenario_h",
        "dependency metadata (unsupported)",
        "T-H02 carries `depends_on` metadata, but MaintenanceTask has no prerequisite "
        "field, so DEPENDENCY_CONFLICT is documented and never emitted by any stage.",
        context,
        _request("BRQ-H01", prerequisites, section),
        note="Metadata-only: demonstrates the supported-code honesty contract.",
        expected={"code": "DEPENDENCY_CONFLICT", "emitted": False},
    )


# ------------------------------------------------------------------- scenario I

def build_scenario_i() -> DemoScenario:
    corridor = _corridor("COR-I")
    section = "S1"
    day = SCENARIO_ANCHOR + timedelta(days=8)
    task = _task(
        "T-I01", "COR-I", section,
        day + timedelta(hours=9), day + timedelta(hours=11), 60,
        department="Engineering", asset_type=AssetType.TRACK,
    )
    original = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(task)],
        tasks=[task],
        block_requests=[_request(f"BRQ-{task.task_id}", [task], section)],
    ))

    new_forecast = GoodsForecast(
        forecast_id="FCST-I01",
        corridor_id="COR-I",
        section=section,
        date=day.date(),
        window_start=time(9, 30),
        window_end=time(10, 30),
        probability=0.90,
        volume_tonnes=1500.0,
    )
    replanned = original.model_copy(
        update={
            "goods_forecasts": [new_forecast],
            "existing_blocks": [
                ExistingBlock(
                    block_id="BLK-I01",
                    corridor_id="COR-I",
                    section=section,
                    start_time=day + timedelta(hours=8, minutes=30),
                    end_time=day + timedelta(hours=9, minutes=30),
                    status=BlockStatus.CANCELLED,
                ),
            ],
        }
    )
    return _scenario(
        "scenario_i",
        "replanning fixtures (documentation only)",
        "Two deterministic snapshots (original / replanned) with a described delta; "
        "dynamic replanning itself is out of phase and not wired here.",
        original,
        _request("BRQ-I01", [task], section),
        note="Replanning is NOT implemented in this phase; this fixture documents the "
        "world-delta shape a future replanner would consume.",
        extra={
            "original_context": original,
            "replan_context": replanned,
            "delta_notes": "added peak goods forecast FCST-I01; added a CANCELLED block",
        },
    )


# ------------------------------------------------------------------- scenario J

def build_scenario_j() -> DemoScenario:
    corridor = _corridor("COR-J")
    section = "S1"
    day = SCENARIO_ANCHOR + timedelta(days=9)

    pair = [
        _task("T-J01", "COR-J", section, day + timedelta(hours=9), day + timedelta(hours=13), 60,
              department="Engineering", asset_type=AssetType.TRACK),
        _task("T-J02", "COR-J", section, day + timedelta(hours=9), day + timedelta(hours=13), 60,
              department="Traction Distribution", asset_type=AssetType.OHE,
              work_type=WorkType.CORRECTIVE),
    ]
    clear = _task(
        "T-J03", "COR-J", "S2",
        day + timedelta(hours=14), day + timedelta(hours=16), 60,
        priority=PriorityLevel.HIGH,
        department="Signal & Telecommunication",
        asset_type=AssetType.SIGNALLING, work_type=WorkType.REPAIR,
    )
    peak_forecast = GoodsForecast(
        forecast_id="FCST-J01",
        corridor_id="COR-J",
        section=section,
        date=(day + timedelta(days=1)).date(),
        window_start=time(9, 0),
        window_end=time(10, 30),
        probability=0.90,
        volume_tonnes=1600.0,
    )
    goods_rejected = _task(
        "T-J04", "COR-J", section,
        day + timedelta(days=1, hours=9), day + timedelta(days=1, hours=10, minutes=30), 60,
        department="Engineering", asset_type=AssetType.TRACK, work_type=WorkType.REPAIR,
    )
    existing = ExistingBlock(
        block_id="BLK-J01",
        corridor_id="COR-J",
        section="S2",
        start_time=day + timedelta(days=1, hours=9),
        end_time=day + timedelta(days=1, hours=11),
        status=BlockStatus.APPROVED,
    )
    block_rejected = _task(
        "T-J05", "COR-J", "S2",
        day + timedelta(days=1, hours=9), day + timedelta(days=1, hours=11), 60,
        department="Traction Distribution", asset_type=AssetType.OHE,
    )

    tasks = [*pair, clear, goods_rejected, block_rejected]
    context = _horizon(PlanningContext(
        corridors=[corridor],
        assets=[_asset(task) for task in tasks],
        tasks=tasks,
        block_requests=[_request(f"BRQ-{task.task_id}", [task], task.metadata["section"]) for task in tasks],
        goods_forecasts=[peak_forecast],
        existing_blocks=[existing],
    ))
    return _scenario(
        "scenario_j",
        "mixed feasibility smoke world",
        "One context with an integrable pair, a clear single, a goods-rejected task "
        "and an existing-block-rejected task drives a full pipeline run whose "
        "schedule validates cleanly.",
        context,
        _request("BRQ-J01", tasks, section),
        expected={
            "integrated_pair": [t.task_id for t in pair],
            "clear_task": clear.task_id,
            "goods_rejected": goods_rejected.task_id,
            "block_rejected": block_rejected.task_id,
        },
    )


# ------------------------------------------------------------------- registry

_BUILDERS = {
    "scenario_a": build_scenario_a,
    "scenario_b": build_scenario_b,
    "scenario_c": build_scenario_c,
    "scenario_d": build_scenario_d,
    "scenario_e": build_scenario_e,
    "scenario_f": build_scenario_f,
    "scenario_g": build_scenario_g,
    "scenario_h": build_scenario_h,
    "scenario_i": build_scenario_i,
    "scenario_j": build_scenario_j,
}


def all_scenarios() -> list[DemoScenario]:
    """Every scenario built in stable order (deterministic, no randomness)."""
    return [builder() for builder in (_BUILDERS[scenario_id] for scenario_id in SCENARIO_IDS)]


def get_scenario(scenario_id: str) -> DemoScenario:
    """Build one scenario by id; raises KeyError for unknown ids."""
    if scenario_id not in _BUILDERS:
        raise KeyError(
            f"unknown scenario '{scenario_id}'; available: {', '.join(SCENARIO_IDS)}"
        )
    return _BUILDERS[scenario_id]()


__all__ = [
    "SCENARIO_ANCHOR",
    "SCENARIO_IDS",
    "DemoScenario",
    "all_scenarios",
    "build_scenario_a",
    "build_scenario_b",
    "build_scenario_c",
    "build_scenario_d",
    "build_scenario_e",
    "build_scenario_f",
    "build_scenario_g",
    "build_scenario_h",
    "build_scenario_i",
    "build_scenario_j",
    "get_scenario",
]