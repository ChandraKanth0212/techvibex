from fastapi import APIRouter
from src.synthetic.presets import NDLS_CNB_CORRIDOR_PRESET

router = APIRouter(prefix="/infrastructure", tags=["Master Topology"])


@router.get("/stations")
async def get_stations():
    """Get station metadata for current corridor."""
    return NDLS_CNB_CORRIDOR_PRESET["stations"]


@router.get("/sections")
async def get_sections():
    """Get track section geometries and speed limits."""
    return NDLS_CNB_CORRIDOR_PRESET["sections"]
