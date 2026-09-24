from app.scoring.base import BaseScorer
from app.schemas.source_data import MaintenanceTaskInput

class SafetyImpactScorer(BaseScorer):
    """Evaluates safety impact score"""
    
    def evaluate(self, task: MaintenanceTaskInput) -> float:
        score = task.safety_impact if task.safety_impact is not None else 50.0
        return min(100.0, max(0.0, float(score)))
