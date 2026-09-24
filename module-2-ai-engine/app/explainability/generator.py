from typing import List, Tuple, Dict, Any
from app.schemas.source_data import MaintenanceTaskInput
from app.schemas.ai_output import FactorBreakdown
from app.models.enums import PriorityLevel, RiskLevel
from app.explainability.reason_codes import ReasonCodes

class ExplainabilityGenerator:
    """Generates machine-parseable reason codes and human-readable plain English explanations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config.get("thresholds", {}).get("reason_codes", {
            "criticality": 75.0,
            "safety": 70.0,
            "defect": 80.0,
            "failure": 70.0,
            "exposure": 75.0,
            "operational": 75.0,
        })

    def generate(
        self,
        task: MaintenanceTaskInput,
        factors: FactorBreakdown,
        priority_score: float,
        priority_level: PriorityLevel,
        risk_level: RiskLevel
    ) -> Tuple[List[str], str, str]:
        codes = []
        details = []

        if factors.criticality_score >= self.cfg.get("criticality", 75.0):
            codes.append(ReasonCodes.HIGH_ASSET_CRITICALITY)
            details.append(f"high asset criticality ({factors.criticality_score:.1f}/100)")

        if factors.safety_impact_score >= self.cfg.get("safety", 70.0):
            codes.append(ReasonCodes.SAFETY_RELATED_DEFECT)
            details.append(f"severe safety impact ({factors.safety_impact_score:.1f}/100)")

        if task.overdue_days and task.overdue_days > 0:
            codes.append(ReasonCodes.OVERDUE_MAINTENANCE)
            details.append(f"maintenance overdue by {task.overdue_days} days (factor {factors.overdue_factor:.2f}x)")

        if factors.defect_severity_score >= self.cfg.get("defect", 80.0):
            codes.append(ReasonCodes.CRITICAL_DEFECT_SEVERITY)
            details.append(f"critical defect severity ({factors.defect_severity_score:.1f}/100)")

        if factors.failure_risk_score >= self.cfg.get("failure", 70.0):
            codes.append(ReasonCodes.HIGH_FAILURE_RISK)
            details.append(f"high component failure probability ({task.failure_probability:.2f})")

        if factors.train_exposure_score >= self.cfg.get("exposure", 75.0):
            codes.append(ReasonCodes.HEAVY_TRAIN_EXPOSURE)
            details.append(f"heavy train traffic exposure ({factors.train_exposure_score:.1f}/100)")

        if factors.operational_impact_score >= self.cfg.get("operational", 75.0):
            codes.append(ReasonCodes.SEVERE_OPERATIONAL_IMPACT)
            details.append(f"high operational/speed restriction impact ({factors.operational_impact_score:.1f}/100)")

        if not codes:
            codes.append(ReasonCodes.ROUTINE_MAINTENANCE)
            details.append("standard routine maintenance parameters")

        # Action Recommendation String
        if priority_level == PriorityLevel.CRITICAL or risk_level == RiskLevel.EXTREME:
            action = "IMMEDIATE_BLOCK_ALLOCATION_REQUIRED: Prioritize in next available corridor window."
        elif priority_level == PriorityLevel.HIGH or risk_level == RiskLevel.HIGH:
            action = "HIGH_PRIORITY_SCHEDULE: Schedule within 24-48 hours."
        elif priority_level == PriorityLevel.MEDIUM:
            action = "STANDARD_SCHEDULE: Include in regular weekly corridor block planning."
        else:
            action = "DEFERRED_SCHEDULE: Low priority task; schedule during non-peak shadow block."

        # Plain English Explanation Builder
        reasons_str = ", ".join(details) if details else "standard operational requirements"
        explanation = (
            f"Task {task.request_id} for {task.department.value} on section {task.section} ({task.location}) "
            f"assigned {priority_level.value} priority (Score: {priority_score:.1f}/100) and {risk_level.value} risk. "
            f"Key contributing factors: {reasons_str}."
        )

        return codes, action, explanation
