from abc import ABC, abstractmethod
from typing import List, Dict, Any


class BaseAdapter(ABC):
    """
    Abstract base class for all legacy / canonical Indian Railways system adapters.
    """

    def __init__(self, system_name: str):
        self.system_name = system_name

    @abstractmethod
    async def fetch_data(() -> List[Dict[str, Any]]:
        """Fetch raw records from external simulated system."""
        pass

    @abstractmethod
    def normalize_record(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize raw system payload into canonical schema format with source tracking."""
        pass
