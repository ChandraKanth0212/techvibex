from app.scoring.base import BaseScorer
from app.schemas.source_data import MaintenanceTaskInput

class FailureRiskScorer(BaseScorer):
    """Evaluates component failure risk score based on failure probability [0-1]"""
    
    def evaluate(self, task: MaintenanceTaskInput) -> float:
        prob = task.failure_probability if task.failure_probability is not None else 0.05
        # Convert 0-1 probability into 0-100 score
        score = prob * 100.0
        return min(100.0, max(0.0, float(score)))
