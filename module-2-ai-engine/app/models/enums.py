from enum import Enum

class Department(str, Enum):
    ENGINEERING = "ENGINEERING"  # Track, Civil, Bridges
    SIGNALLING = "SIGNALLING"    # S&T, Interlocking, Telecommunication
    TRACTION = "TRACTION"        # OHE, Electrical, Substation
    OPERATIONS = "OPERATIONS"    # Traffic, Yard (Extensible)

class BlockType(str, Enum):
    SHADOW_BLOCK = "SHADOW_BLOCK"
    INTEGRATED_BLOCK = "INTEGRATED_BLOCK"
    CORRIDOR_BLOCK = "CORRIDOR_BLOCK"
    EMERGENCY_BLOCK = "EMERGENCY_BLOCK"

class PriorityLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class RiskLevel(str, Enum):
    EXTREME = "EXTREME"
    HIGH = "HIGH"
    MODERATE = "MODERATE"
    LOW = "LOW"
