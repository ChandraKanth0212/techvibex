"""Machine-readable conflict/rejection codes and their support status.

The Phase 2 specification names ten constraint categories. Only those the
current contract schemas can actually evaluate with real data are emitted by
:class:`app.constraints.engine.ConstraintEngine`; the rest are explicitly
unsupported (documented, never fabricated).
"""

from enum import Enum

from contracts import BlockStatus


class ConflictCode(str, Enum):
    """Vocabulary of conflict codes shared by generation and validation."""

    TIME_CONFLICT = "TIME_CONFLICT"
    TRAIN_CONFLICT = "TRAIN_CONFLICT"
    GOODS_CONFLICT = "GOODS_CONFLICT"
    CORRIDOR_CONFLICT = "CORRIDOR_CONFLICT"
    RESOURCE_CONFLICT = "RESOURCE_CONFLICT"
    POWER_CONFLICT = "POWER_CONFLICT"
    DURATION_CONFLICT = "DURATION_CONFLICT"
    DEPENDENCY_CONFLICT = "DEPENDENCY_CONFLICT"
    LOCATION_CONFLICT = "LOCATION_CONFLICT"
    EXISTING_BLOCK_CONFLICT = "EXISTING_BLOCK_CONFLICT"


#: Codes the engine can currently emit (schemas provide the needed data).
SUPPORTED_CONFLICT_CODES: frozenset[str] = frozenset(
    {
        ConflictCode.TIME_CONFLICT.value,
        ConflictCode.TRAIN_CONFLICT.value,
        ConflictCode.GOODS_CONFLICT.value,
        ConflictCode.CORRIDOR_CONFLICT.value,
        ConflictCode.RESOURCE_CONFLICT.value,
        ConflictCode.DURATION_CONFLICT.value,
        ConflictCode.LOCATION_CONFLICT.value,
        ConflictCode.EXISTING_BLOCK_CONFLICT.value,
    }
)

#: Codes intentionally not enforced yet, with the reason (no invented fields).
UNSUPPORTED_CONFLICT_CODES: dict[str, str] = {
    ConflictCode.POWER_CONFLICT.value: (
        "contracts contain no power-isolation / feed-section requirement fields"
    ),
    ConflictCode.DEPENDENCY_CONFLICT.value: (
        "MaintenanceTask has no prerequisite / dependency fields"
    ),
}

#: Existing-block statuses that still occupy the corridor and block candidates.
ACTIVE_BLOCK_STATUSES: frozenset[BlockStatus] = frozenset(
    {
        BlockStatus.PLANNED,
        BlockStatus.APPROVED,
        BlockStatus.ACTIVE,
    }
)

__all__ = [
    "ConflictCode",
    "SUPPORTED_CONFLICT_CODES",
    "UNSUPPORTED_CONFLICT_CODES",
    "ACTIVE_BLOCK_STATUSES",
]