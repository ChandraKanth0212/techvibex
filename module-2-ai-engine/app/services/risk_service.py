from typing import Tuple, Dict, Any
from app.schemas.source_data import MaintenanceTaskInput
from app.schemas.ai_output import FactorBreakdown
from app.models.enums import RiskLevel

class RiskService:
    """ISO 31000-aligned risk evaluation methodology using a probability x consequence decision-support model."""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.thresholds = config.get("thresholds", {}).get("risk_level", {
            "extreme": 80.0,
            "high": 60.0,
            "moderate": 35.0,
        })

    def evaluate_risk(self, task: MaintenanceTaskInput, factors: FactorBreakdown) -> Tuple[float, RiskLevel]:
        failure_prob = task.failure_probability if task.failure_probability is not None else 0.05
        
        # Consequence factor = 0.40*Safety + 0.30*Criticality + 0.15*Exposure + 0.15*Operational
        consequence = (
            0.40 * factors.safety_impact_score +
            0.30 * factors.criticality_score +
            0.15 * factors.train_exposure_score +
            0.15 * factors.operational_impact_score
        )
        
        # Risk Score = Failure Probability x Consequence Factor (scaled to 0-100)
        raw_risk = failure_prob * consequence * 1.5  # Amplified scaling factor for decision support visibility
        risk_score = min(100.0, max(0.0, round(float(raw_risk), 2)))

        if risk_score >= self.thresholds.get("extreme", 80.0):
            risk_level = RiskLevel.EXTREME
        elif risk_score >= self.thresholds.get("high", 60.0):
            risk_level = RiskLevel.HIGH
        elif risk_score >= self.thresholds.get("moderate", 35.0):
            risk_level = RiskLevel.MODERATE
        else:
            risk_level = RiskLevel.LOW

        return risk_score, risk_level
