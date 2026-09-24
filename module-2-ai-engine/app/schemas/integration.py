from typing import List
from pydantic import BaseModel, Field

class IntegrationGroup(BaseModel):
    group_id: str = Field(..., description="Unique ID for candidate block group")
    section: str = Field(..., description="Common railway section")
    request_ids: List[str] = Field(..., description="List of matched maintenance request IDs")
    departments: List[str] = Field(..., description="List of involved departments")
    suggested_block_type: str = Field("INTEGRATED_SHADOW_BLOCK")
    reason: str = Field(..., description="Reason for grouping tasks")

class IntegrationCandidateResponse(BaseModel):
    total_candidates_found: int
    groups: List[IntegrationGroup]
