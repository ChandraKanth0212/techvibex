import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from railopt_contracts import DisruptionEntity, DisruptionSeverity, DisruptionType
from src.synthetic.simulator import simulator_instance

router = APIRouter(prefix="/synthetic", tags=["Synthetic Generator Controls"])


class DisruptionInjectionRequest(BaseModel):
    disruption_type: DisruptionType = DisruptionType.SIGNAL_FAILURE
    severity: DisruptionSeverity = DisruptionSeverity.MEDIUM
    section_id: str
    speed_limit_kmh: Optional[float] = 30.0
    description: str = "Synthetic maintenance line block"


@router.post("/simulator/tick")
async def trigger_simulation_tick():
    """Manually triggers 1 tick step in the synthetic train movement engine."""
    updated = simulator_instance.tick()
    return {"status": "SUCCESS", "updated_trains_count": len(updated)}


@router.post("/inject-disruption")
async def inject_synthetic_disruption(req: DisruptionInjectionRequest):
    """Dynamically injects a track disruption / speed restriction into the live simulator."""
    disruption = DisruptionEntity(
        disruption_id=uuid.uuid4(),
        disruption_type=req.disruption_type,
        severity=req.severity,
        section_id=uuid.UUID(req.section_id),
        start_time=datetime.now(timezone.utc),
        speed_limit_kmh=req.speed_limit_kmh,
        description=req.description,
        is_active=True
    )
    simulator_instance.active_disruptions.append(disruption)
    return {"status": "SUCCESS", "disruption_id": str(disruption.disruption_id)}
