from app.scoring.base import BaseScorer
from app.schemas.source_data import MaintenanceTaskInput

class DefectSeverityScorer(BaseScorer):
    """Evaluates defect severity score"""
    
    def evaluate(self, task: MaintenanceTaskInput) -> float:
        score = task.defect_severity if task.defect_severity is not None else 0.0
        return min(100.0, max(0.0, float(score)))
