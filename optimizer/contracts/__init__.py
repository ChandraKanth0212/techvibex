"""Temporary shared contracts for the RailOpt Optimization Engine.

NOTE: This package is TEMPORARY. It exists so Module 3 is self-contained while
Module 1 / Module 2 shared schemas are not yet available. Once a repository-wide
``/contracts`` directory is created, these models should be moved there and this
package re-exports updated.

See ``contracts/README.md`` for migration notes.
"""

from .asset import Asset
from .block_request import BlockRequest
from .corridor import Corridor
from .defect import Defect
from .enums import (
    AssetType,
    BlockStatus,
    IntegratedCompatibility,
    OccupancyType,
    PriorityLevel,
    ResourceType,
    SeverityLevel,
    TrainDirection,
    ViolationSeverity,
    WorkType,
)
from .existing_block import ExistingBlock
from .goods_forecast import GoodsForecast
from .maintenance_task import MaintenanceTask
from .priority import AIRecommendation, PriorityResult
from .resource import Resource
from .service_types import (
    BlockCandidate,
    ConstraintViolation,
    ExplainabilityResult,
    ExplanationRecord,
    IntegratedBlock,
    IntegratedBlockCandidate,
    OptimizationResult,
    ScheduleBlock,
    ScheduleMetrics,
    ScheduleResult,
    ScheduleSolution,
    ScheduleValidationResult,
    TaskSchedulingInfo,
    ValidationReport,
    ValidationResult,
)
from .train_movement import TrainMovement

__all__ = [
    "Asset",
    "AssetType",
    "AIRecommendation",
    "PriorityResult",
    "BlockCandidate",
    "BlockRequest",
    "BlockStatus",
    "ConstraintViolation",
    "Corridor",
    "Defect",
    "ExistingBlock",
    "ExplainabilityResult",
    "ExplanationRecord",
    "GoodsForecast",
    "IntegratedBlock",
    "IntegratedBlockCandidate",
    "IntegratedCompatibility",
    "MaintenanceTask",
    "OccupancyType",
    "OptimizationResult",
    "PriorityLevel",
    "Resource",
    "ResourceType",
    "ScheduleMetrics",
    "ScheduleResult",
    "ScheduleSolution",
    "ScheduleBlock",
    "ScheduleValidationResult",
    "SeverityLevel",
    "TaskSchedulingInfo",
    "TrainDirection",
    "TrainMovement",
    "ValidationReport",
    "ValidationResult",
    "ViolationSeverity",
    "WorkType",
]