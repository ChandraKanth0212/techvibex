from abc import ABC, abstractmethod
from typing import Any, List


class BaseRailwayAdapter(ABC):
    @abstractmethod
    async def parse_payload(self, raw_data: Any) -> List[Any]:
        """Parses raw source payload into Canonical Data Entities."""
        pass

    @abstractmethod
    async def validate(self, canonical_entities: List[Any]) -> List[Any]:
        """Validates canonical entities for schema & range correctness."""
        pass
