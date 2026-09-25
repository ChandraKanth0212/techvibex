"""Operational domain models that are internal to the engine.

Railway domain entities shared with other modules live in ``contracts``;
this package holds engine-internal concerns such as execution mode.
"""

from enum import Enum


class DataMode(str, Enum):
    SYNTHETIC_DEMO = "SYNTHETIC_DEMO"
    PRODUCTION = "PRODUCTION"


__all__ = ["DataMode"]