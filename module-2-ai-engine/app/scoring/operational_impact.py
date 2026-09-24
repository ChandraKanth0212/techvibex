from app.scoring.base import BaseScorer
from app.schemas.source_data import MaintenanceTaskInput

class OperationalImpactScorer(BaseScorer):
    """Evaluates operational impact score based on speed restrictions & punctuality impact"""
    
    def evaluate(self, task: MaintenanceTaskInput) -> float:
        score = task.operational_impact if task.operational_impact is not None else 50.0
        return min(100.0, max(0.0, float(score)))
