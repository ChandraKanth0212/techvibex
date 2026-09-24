from typing import Dict, Any
from app.scoring.base import BaseScorer
from app.schemas.source_data import MaintenanceTaskInput

DEFAULT_ASSET_TYPE_BOOSTS = {
    "RAIL_FRACTURE": 95.0,
    "POINT_SWITCH": 90.0,
    "OHE_CATENARY": 85.0,
    "SIGNAL_INTERLOCKING": 88.0,
    "BRIDGE_EXPANSION": 92.0,
    "TRACK_GEOMETRY": 75.0,
}

class CriticalityScorer(BaseScorer):
    """Evaluates asset criticality score based on asset type & input metrics loaded from configuration"""
    
    def __init__(self, config: Dict[str, Any] = None):
        cfg = config or {}
        self.asset_type_boosts = cfg.get("asset_type_boosts", DEFAULT_ASSET_TYPE_BOOSTS)

    def evaluate(self, task: MaintenanceTaskInput) -> float:
        base_score = task.criticality if task.criticality is not None else 50.0
        asset_boost = self.asset_type_boosts.get(task.asset_type.upper(), 0.0)
        
        final_score = max(base_score, asset_boost)
        return min(100.0, max(0.0, float(final_score)))
