from abc import ABC, abstractmethod
from app.schemas.source_data import MaintenanceTaskInput

class BaseScorer(ABC):
    """Abstract base class for all scoring modules"""
    
    @abstractmethod
    def evaluate(self, task: MaintenanceTaskInput) -> float:
        """Evaluate task and return a normalized score between 0.0 and 100.0"""
        pass
