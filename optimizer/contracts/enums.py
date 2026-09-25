"""Enumerations shared across the temporary contracts."""

from enum import Enum


class AssetType(str, Enum):
    TRACK = "TRACK"
    OHE = "OHE"
    SIGNALLING = "SIGNALLING"
    BRIDGE = "BRIDGE"
    TUNNEL = "TUNNEL"
    STATION = "STATION"
    OTHER = "OTHER"


class SeverityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class PriorityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class WorkType(str, Enum):
    PREVENTIVE = "PREVENTIVE"
    CORRECTIVE = "CORRECTIVE"
    INSPECTION = "INSPECTION"
    REPAIR = "REPAIR"
    REPLACEMENT = "REPLACEMENT"
    UPGRADE = "UPGRADE"


class OccupancyType(str, Enum):
    TRAFFIC_BLOCK = "TRAFFIC_BLOCK"
    POSSESSION = "POSSESSION"
    SLOW_MOVEMENT = "SLOW_MOVEMENT"


class TrainDirection(str, Enum):
    UP = "UP"
    DOWN = "DOWN"
    BOTH = "BOTH"


class ResourceType(str, Enum):
    POSSESSION = "POSSESSION"
    ENGINEERING_TRAIN = "ENGINEERING_TRAIN"
    MACHINERY = "MACHINERY"
    MANPOWER = "MANPOWER"
    MATERIAL = "MATERIAL"


class BlockStatus(str, Enum):
    PLANNED = "PLANNED"
    APPROVED = "APPROVED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ViolationSeverity(str, Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"


class IntegratedCompatibility(str, Enum):
    COMPATIBLE = "COMPATIBLE"
    INCOMPATIBLE = "INCOMPATIBLE"