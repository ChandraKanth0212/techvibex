from typing import Tuple, Dict, Any
from app.schemas.source_data import MaintenanceTaskInput
from app.schemas.ai_output import FactorBreakdown
from app.models.enums import PriorityLevel
from app.scoring.criticality import CriticalityScorer
from app.scoring.urgency import UrgencyScorer
from app.scoring.defect_severity import DefectSeverityScorer
from app.scoring.failure_risk import FailureRiskScorer
from app.scoring.safety_impact import SafetyImpactScorer
from app.scoring.train_exposure import TrainExposureScorer
from app.scoring.operational_impact import OperationalImpactScorer

class CompositeScorer:
    """Aggregates sub-component factor scores into a unified composite priority score"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.weights = config.get("weights", {
            "criticality": 0.20,
            "safety_impact": 0.20,
            "defect_severity": 0.15,
            "urgency": 0.15,
            "failure_risk": 0.15,
            "train_exposure": 0.08,
            "operational_impact": 0.07,
        })
        self.thresholds = config.get("thresholds", {}).get("priority_level", {
            "critical": 85.0,
            "high": 65.0,
            "medium": 40.0,
        })
        
        overdue_cfg = config.get("overdue", {"max_multiplier": 2.5, "scaling_days": 14.0})
        
        self.criticality_scorer = CriticalityScorer(config)
        self.urgency_scorer = UrgencyScorer(
            max_multiplier=overdue_cfg.get("max_multiplier", 2.5),
            scaling_days=overdue_cfg.get("scaling_days", 14.0)
        )
        self.defect_scorer = DefectSeverityScorer()
        self.failure_scorer = FailureRiskScorer()
        self.safety_scorer = SafetyImpactScorer()
        self.exposure_scorer = TrainExposureScorer()
        self.operational_scorer = OperationalImpactScorer()

    def evaluate(self, task: MaintenanceTaskInput) -> Tuple[float, PriorityLevel, FactorBreakdown]:
        # Compute sub-scores
        crit = self.criticality_scorer.evaluate(task)
        urg = self.urgency_scorer.evaluate(task)
        def_sev = self.defect_scorer.evaluate(task)
        fail_risk = self.failure_scorer.evaluate(task)
        safety = self.safety_scorer.evaluate(task)
        exposure = self.exposure_scorer.evaluate(task)
        ops = self.operational_scorer.evaluate(task)
        
        overdue_fac = self.urgency_scorer.get_overdue_factor(task)

        factors = FactorBreakdown(
            criticality_score=crit,
            urgency_score=urg,
            defect_severity_score=def_sev,
            safety_impact_score=safety,
            failure_risk_score=fail_risk,
            overdue_factor=overdue_fac,
            train_exposure_score=exposure,
            operational_impact_score=ops
        )

        # Weighted Linear Combination: P = sum(w_i * S_i)
        priority_score = (
            crit * self.weights.get("criticality", 0.20) +
            safety * self.weights.get("safety_impact", 0.20) +
            def_sev * self.weights.get("defect_severity", 0.15) +
            urg * self.weights.get("urgency", 0.15) +
            fail_risk * self.weights.get("failure_risk", 0.15) +
            exposure * self.weights.get("train_exposure", 0.08) +
            ops * self.weights.get("operational_impact", 0.07)
        )
        
        priority_score = min(100.0, max(0.0, round(float(priority_score), 2)))

        # Priority Level Categorization
        if priority_score >= self.thresholds.get("critical", 85.0):
            priority_level = PriorityLevel.CRITICAL
        elif priority_score >= self.thresholds.get("high", 65.0):
            priority_level = PriorityLevel.HIGH
        elif priority_score >= self.thresholds.get("medium", 40.0):
            priority_level = PriorityLevel.MEDIUM
        else:
            priority_level = PriorityLevel.LOW

        return priority_score, priority_level, factors
