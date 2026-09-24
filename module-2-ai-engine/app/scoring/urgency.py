from app.scoring.base import BaseScorer
from app.schemas.source_data import MaintenanceTaskInput

class UrgencyScorer(BaseScorer):
    """Evaluates urgency score scaled by overdue maintenance days"""
    
    def __init__(self, max_multiplier: float = 2.5, scaling_days: float = 14.0):
        self.max_multiplier = max_multiplier
        self.scaling_days = scaling_days

    def evaluate(self, task: MaintenanceTaskInput) -> float:
        base_urgency = task.urgency if task.urgency is not None else 50.0
        overdue_days = task.overdue_days if task.overdue_days is not None else 0
        
        # Calculate overdue multiplier: 1.0 + min(1.5, overdue_days / 14)
        overdue_factor = 1.0 + min(self.max_multiplier - 1.0, overdue_days / self.scaling_days)
        
        scaled_urgency = base_urgency * overdue_factor
        return min(100.0, max(0.0, float(scaled_urgency)))
        
    def get_overdue_factor(self, task: MaintenanceTaskInput) -> float:
        overdue_days = task.overdue_days if task.overdue_days is not None else 0
        return 1.0 + min(self.max_multiplier - 1.0, overdue_days / self.scaling_days)
