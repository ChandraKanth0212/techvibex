"""
Module 2 → Module 3 Integration Consumer Mock.

Demonstrates how Module 3 (Optimization Engine) consumes Module 2's AI recommendations
and integration candidate hints to optimize final block schedules.

STRICT BOUNDARY ENFORCEMENT:
Module 2 output MUST NOT contain optimizer-derived fields:
- final_block_start
- final_block_end
- corridor_allocation
- train_conflict_resolution
- crew_assignment
"""

from typing import Dict, Any, List
from app.schemas.ai_output import AIRecommendation
from app.schemas.integration import IntegrationGroup

class Module3ConsumerMock:
    """Mock Module 3 consumer verifying structural compatibility of Module 2 recommendations."""
    
    FORBIDDEN_OPTIMIZER_FIELDS = [
        "final_block_start",
        "final_block_end",
        "corridor_allocation",
        "train_conflict_resolution",
        "goods_conflict_resolution",
        "crew_assignment",
        "final_schedule_status"
    ]

    @classmethod
    def consume_ai_recommendation(cls, recommendation: AIRecommendation) -> Dict[str, Any]:
        """
        Validates that an AIRecommendation can be consumed by Module 3
        without violating module responsibility boundaries.
        """
        data = recommendation.model_dump(mode="json")
        
        # Verify strict boundary constraint
        for forbidden in cls.FORBIDDEN_OPTIMIZER_FIELDS:
            if forbidden in data:
                raise ValueError(f"BOUNDARY VIOLATION: Module 2 output illegal optimizer field: '{forbidden}'")

        return {
            "consumed_request_id": data["request_id"],
            "priority_score": data["priority_score"],
            "priority_level": data["priority_level"],
            "risk_score": data["risk_score"],
            "risk_level": data["risk_level"],
            "recommended_action": data["recommended_action"],
            "reason_codes": data["reason_codes"],
            "is_integration_candidate": data["integration_candidate"],
            "integration_group_id": data.get("integration_group_id"),
            "status": "ACCEPTED_FOR_OPTIMIZATION"
        }

    @classmethod
    def consume_integration_candidates(cls, candidates: List[IntegrationGroup]) -> Dict[str, Any]:
        """
        Consumes multi-department integration candidate hints for block slot bundling.
        """
        consumed_groups = []
        for group in candidates:
            g_data = group.model_dump(mode="json")
            for forbidden in cls.FORBIDDEN_OPTIMIZER_FIELDS:
                if forbidden in g_data:
                    raise ValueError(f"BOUNDARY VIOLATION: Integration candidate contains illegal field: '{forbidden}'")
            consumed_groups.append({
                "group_id": g_data["group_id"],
                "section": g_data["section"],
                "requests_bundled": len(g_data["request_ids"]),
                "candidate_departments": g_data["departments"]
            })
            
        return {
            "total_candidate_groups_accepted": len(consumed_groups),
            "groups": consumed_groups
        }
