from typing import List
from fastapi import APIRouter
from railopt_contracts import NetworkStateSnapshot, LiveTelemetryEntity
from src.services.snapshot_service import SnapshotService
from src.synthetic.simulator import simulator_instance

router = APIRouter(prefix="/state", tags=["Operational State"])


@router.get("/snapshot", response_model=NetworkStateSnapshot)
async def get_network_snapshot():
    """Returns atomic network snapshot payload consumed by Module 2 (AI) & Module 3 (Optimization)."""
    return await SnapshotService.get_current_snapshot()


@router.get("/trains/active", response_model=List[LiveTelemetryEntity])
async def get_active_trains():
    """Returns active train telemetry list consumed by Module 4 (Command Center UI)."""
    return list(simulator_instance.active_telemetry.values())
