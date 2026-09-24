from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.enums import Department, BlockType

class Asset(BaseModel):
    asset_id: str = Field(..., description="Unique asset identifier")
    asset_type: str = Field(..., description="Type of asset (e.g. Rail, Switch, OHE, Signal)")
    section: str = Field(..., description="Railway section identifier")
    location: str = Field(..., description="Kilometer or location code")
    criticality: float = Field(50.0, ge=0.0, le=100.0, description="Base asset criticality score [0-100]")

class Defect(BaseModel):
    defect_id: str = Field(..., description="Unique defect identifier")
    asset_id: str = Field(..., description="Target asset identifier")
    defect_type: str = Field(..., description="Classification of defect")
    severity: float = Field(..., ge=0.0, le=100.0, description="Defect severity rating [0-100]")
    reported_at: datetime = Field(default_factory=datetime.utcnow)

class MaintenanceTaskInput(BaseModel):
    request_id: str = Field(..., description="Unique maintenance block request ID")
    department: Department = Field(..., description="Requesting railway department")
    asset_id: str = Field(..., description="Canonical ID of target asset")
    asset_type: str = Field(..., description="Type of asset (e.g. Rail, Switch, OHE, Signal)")
    section: str = Field(..., description="Railway section identifier (e.g. SECTION_A_B)")
    location: str = Field(..., description="Exact kilometer mark or location code (e.g. KM_412/12)")
    work_type: str = Field(..., description="Type of work (e.g. Deep Screening, OHE Inspection)")
    description: str = Field(..., description="Detailed description of maintenance work")
    duration_minutes: int = Field(..., ge=15, description="Requested block duration in minutes")
    
    # Optional domain metrics (defaulted safely if not provided by source)
    criticality: Optional[float] = Field(50.0, ge=0.0, le=100.0, description="Base asset criticality score [0-100]")
    urgency: Optional[float] = Field(50.0, ge=0.0, le=100.0, description="Base urgency score [0-100]")
    defect_severity: Optional[float] = Field(0.0, ge=0.0, le=100.0, description="Defect severity rating [0-100]")
    overdue_days: Optional[int] = Field(0, ge=0, description="Days maintenance is overdue past schedule")
    failure_probability: Optional[float] = Field(0.05, ge=0.0, le=1.0, description="Estimated failure probability [0-1]")
    safety_impact: Optional[float] = Field(50.0, ge=0.0, le=100.0, description="Safety consequence factor [0-100]")
    train_exposure: Optional[float] = Field(50.0, ge=0.0, le=100.0, description="Daily train density/exposure [0-100]")
    operational_impact: Optional[float] = Field(50.0, ge=0.0, le=100.0, description="Punctuality/speed restriction impact [0-100]")
    
    preferred_start: Optional[datetime] = Field(None, description="Preferred window start time")
    preferred_end: Optional[datetime] = Field(None, description="Preferred window end time")
    required_resources: Optional[List[str]] = Field(default_factory=list, description="List of required equipment/crew")
    block_type: Optional[BlockType] = Field(BlockType.CORRIDOR_BLOCK, description="Type of block requested")
    status: Optional[str] = Field("PENDING_AI_EVALUATION", description="Current request processing status")
