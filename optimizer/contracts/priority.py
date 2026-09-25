"""AIRecommendation / PriorityResult: output of the Module 2 AI priority model."""

from pydantic import BaseModel, Field

from .enums import PriorityLevel


class AIRecommendation(BaseModel):
    task_id: str = Field(min_length=1)
    priority_score: float = Field(ge=0.0, le=100.0)
    recommended_priority: PriorityLevel
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = ""
    model_version: str = "unknown"


# Friendly alias used by the optimisation pipeline.
PriorityResult = AIRecommendation