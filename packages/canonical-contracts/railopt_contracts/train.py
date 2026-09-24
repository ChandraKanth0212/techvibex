from enum import Enum
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class TrainType(str, Enum):
    PASSENGER = "PASSENGER"
    FREIGHT = "FREIGHT"
    MAINTENANCE = "MAINTENANCE"


class TrainPriority(str, Enum):
    PRIORITY_1 = "PRIORITY_1"  # Rajdhani / Vande Bharat / Shatabdi
    PRIORITY_2 = "PRIORITY_2"  # Superfast Express
    PRIORITY_3 = "PRIORITY_3"  # Express / Mail
    PRIORITY_4 = "PRIORITY_4"  # Passenger / Commuter
    PRIORITY_5 = "PRIORITY_5"  # Goods / Freight


class TrainEntity(BaseModel):
    train_id: UUID = Field(..., description="Unique UUID for the train entity")
    train_number: str = Field(..., description="Train number, e.g., '12951'")
    train_name: str = Field(..., description="Name of the train, e.g., 'Mumbai Rajdhani'")
    train_type: TrainType = Field(default=TrainType.PASSENGER, description="Type of train")
    priority: TrainPriority = Field(default=TrainPriority.PRIORITY_2, description="Operational priority level")
    length_meters: float = Field(default=650.0, description="Train length in meters")
    max_speed_kmh: float = Field(default=130.0, description="Maximum operational speed in km/h")
    hauling_loco_type: Optional[str] = Field(default="WAP-7", description="Locomotive model type")

    class Config:
        from_attributes = True
