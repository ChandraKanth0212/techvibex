from app.scoring.base import BaseScorer
from app.schemas.source_data import MaintenanceTaskInput

class TrainExposureScorer(BaseScorer):
    """Evaluates train exposure score based on passenger and freight traffic volume"""
    
    def evaluate(self, task: MaintenanceTaskInput) -> float:
        score = task.train_exposure if task.train_exposure is not None else 50.0
        return min(100.0, max(0.0, float(score)))
