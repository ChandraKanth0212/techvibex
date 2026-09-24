from typing import Dict, Any
from fastapi import APIRouter, HTTPException, status
from src.adapters.rtis_gps_adapter import RtisGpsAdapter
from src.synthetic.simulator import simulator_instance

router = APIRouter(prefix="/ingest", tags=["Ingestion & Adapters"])
rtis_adapter = RtisGpsAdapter()


@router.post("/rtis", status_code=status.HTTP_201_CREATED)
async def ingest_rtis_gps(payload: Dict[str, Any]):
    """Ingest live GPS telemetry feed from RTIS (Real-Time Train Info System)."""
    parsed = await rtis_adapter.parse_payload(payload)
    valid = await rtis_adapter.validate(parsed)
    
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid GPS coordinates outside Indian boundary.")

    for item in valid:
        simulator_instance.active_telemetry[item.train_number] = item

    return {"status": "SUCCESS", "ingested_count": len(valid)}
