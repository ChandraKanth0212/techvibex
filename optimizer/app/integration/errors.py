from __future__ import annotations

from collections.abc import Mapping
from typing import Any


class AdapterErrorCode:
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
    INVALID_TYPE = "INVALID_TYPE"
    INVALID_ENUM = "INVALID_ENUM"
    UNRESOLVED_RELATIONSHIP = "UNRESOLVED_RELATIONSHIP"
    UNSUPPORTED_MAPPING = "UNSUPPORTED_MAPPING"
    AMBIGUOUS_MAPPING = "AMBIGUOUS_MAPPING"
    INVALID_TIME_WINDOW = "INVALID_TIME_WINDOW"
    MISSING_TOPOLOGY = "MISSING_TOPOLOGY"
    MISSING_CAPACITY = "MISSING_CAPACITY"
    MISSING_PROBABILITY = "MISSING_PROBABILITY"


class AdapterError(Exception):
    def __init__(
        self,
        code: str,
        entity_type: str,
        field: str | None,
        message: str,
        source_value: Any = None,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.entity_type = entity_type
        self.field = field
        self.message = message
        self.source_value = source_value
        self.details = dict(details or {})
        super().__init__(message)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "entity_type": self.entity_type,
            "field": self.field,
            "message": self.message,
            "source_value": self.source_value,
            "details": self.details,
        }

    def __str__(self) -> str:
        return self.message
