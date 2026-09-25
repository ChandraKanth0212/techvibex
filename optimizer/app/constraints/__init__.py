"""Constraint validation layer for the optimisation engine.

Phase 2 ships the first concrete implementation of the
``app.services.ConstraintEngine`` interface plus the machine-readable conflict
code vocabulary.
"""

from .codes import (
    ACTIVE_BLOCK_STATUSES,
    SUPPORTED_CONFLICT_CODES,
    UNSUPPORTED_CONFLICT_CODES,
    ConflictCode,
)
from .engine import ConstraintEngine

__all__ = [
    "ACTIVE_BLOCK_STATUSES",
    "SUPPORTED_CONFLICT_CODES",
    "UNSUPPORTED_CONFLICT_CODES",
    "ConflictCode",
    "ConstraintEngine",
]