from datetime import datetime
from typing import Optional
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class DepartmentEnum(str, Enum):
    ENGINEERING = "ENGINEERING"
    SIGNAL_TELECOMMUNICATION = "SIGNAL_TELECOMMUNICATION"
    TRACTION = "TRACTION"


class SourceSystemEnum(str, Enum):
    TMS = "TMS"
    SMMS = "SMMS"
    TDMS = "TDMS"
    BDMS = "BDMS"
    COA = "COA"
    GOODS_FORECAST = "GOODS_FORECAST"


class RailOptBaseSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class SourceTrackingMixin(RailOptBaseSchema):
    source_system: SourceSystemEnum = Field(..., alias="sourceSystem")
    source_record_id: str = Field(..., alias="sourceRecordId")
    ingested_at: Optional[datetime] = Field(default_factory=datetime.utcnow, alias="ingestedAt")
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow, alias="updatedAt")
