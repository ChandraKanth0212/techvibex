from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.enums import PriorityLevel, RiskLevel

class FactorBreakdown(BaseModel):
    criticality_score: float = Field(..., ge=0.0, le=100.0)
    urgency_score: float = Field(..., ge=0.0, le=100.0)
    defect_severity_score: float = Field(..., ge=0.0, le=100.0)
    safety_impact_score: float = Field(..., ge=0.0, le=100.0)
    failure_risk_score: float = Field(..., ge=0.0, le=100.0)
    overdue_factor: float = Field(..., ge=0.0)
    train_exposure_score: float = Field(..., ge=0.0, le=100.0)
    operational_impact_score: float = Field(..., ge=0.0, le=100.0)

class AIRecommendation(BaseModel):
    request_id: str = Field(..., description="Corresponding MaintenanceTask ID")
    
    # Factor breakdown
    factors: FactorBreakdown = Field(..., description="Individual factor score breakdown")
    
    # Aggregated Priority & Risk
    priority_score: float = Field(..., ge=0.0, le=100.0, description="Composite priority score [0-100]")
    priority_level: PriorityLevel = Field(..., description="Categorical priority level")
    
    risk_score: float = Field(..., ge=0.0, le=100.0, description="Risk score = Failure Prob x Consequence")
    risk_level: RiskLevel = Field(..., description="Categorical risk level")
    
    recommended_action: str = Field(..., description="Action recommendation for controllers/optimizers")
    reason_codes: List[str] = Field(..., description="Machine-parseable justification codes")
    explanation: str = Field(..., description="Human-readable plain English summary explanation")
    
    # Candidate Integration Info
    integration_candidate: bool = Field(False, description="Flag indicating potential block coordination")
    integration_group_id: Optional[str] = Field(None, description="Group ID if integration candidate identified")
    integration_reason: Optional[str] = Field(None, description="Explanation for integration candidate")
    
    # Metadata
    model_version: str = Field("1.0.0-prototype")
    scoring_version: str = Field("2026.1")
    generated_at: datetime = Field(default_factory=datetime.utcnow)
