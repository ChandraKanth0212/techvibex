from typing import List, Dict, Any, Optional
from datetime import datetime
from app.schemas.source_data import MaintenanceTaskInput
from app.schemas.integration import IntegrationGroup, IntegrationCandidateResponse

class CandidateService:
    """Identifies multi-department coordination opportunities for shadow/integrated blocks"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        config = config or {}
        self.cfg = config.get("candidate_matching", {
            "max_time_gap_minutes": 60,
            "same_section_required": True
        })
        self.max_gap_minutes = float(self.cfg.get("max_time_gap_minutes", 60))

    def _is_temporally_compatible(self, t1: MaintenanceTaskInput, t2: MaintenanceTaskInput) -> bool:
        """Determines if two tasks have overlapping windows or a gap <= max_time_gap_minutes."""
        if not (t1.preferred_start and t1.preferred_end and t2.preferred_start and t2.preferred_end):
            return True  # If timestamps are not provided, fall back to spatial matching

        s1, e1 = t1.preferred_start, t1.preferred_end
        s2, e2 = t2.preferred_start, t2.preferred_end

        if s1 > e1:
            s1, e1 = e1, s1
        if s2 > e2:
            s2, e2 = e2, s2

        # Overlap check
        latest_start = max(s1, s2)
        earliest_end = min(e1, e2)
        if latest_start <= earliest_end:
            return True

        # Separation gap check
        if s2 > e1:
            gap_minutes = (s2 - e1).total_seconds() / 60.0
        else:
            gap_minutes = (s1 - e2).total_seconds() / 60.0

        return gap_minutes <= self.max_gap_minutes

    def find_integration_candidates(self, tasks: List[MaintenanceTaskInput]) -> IntegrationCandidateResponse:
        groups: List[IntegrationGroup] = []
        
        # Group tasks by section
        section_buckets: Dict[str, List[MaintenanceTaskInput]] = {}
        for t in tasks:
            sec = t.section.upper()
            if sec not in section_buckets:
                section_buckets[sec] = []
            section_buckets[sec].append(t)

        group_counter = 1
        for section, section_tasks in section_buckets.items():
            if len(section_tasks) < 2:
                continue

            # Build connected components of compatible multi-department tasks
            visited = set()
            for i, task1 in enumerate(section_tasks):
                if task1.request_id in visited:
                    continue

                cluster = [task1]
                for j, task2 in enumerate(section_tasks):
                    if i != j and task2.request_id not in visited:
                        # Tasks must be from different departments or compatible work, and temporally compatible
                        if task1.department != task2.department and self._is_temporally_compatible(task1, task2):
                            cluster.append(task2)

                # A valid candidate group requires at least 2 distinct departments
                departments = set(t.department.value for t in cluster)
                if len(cluster) >= 2 and len(departments) >= 2:
                    for t in cluster:
                        visited.add(t.request_id)

                    req_ids = [t.request_id for t in cluster]
                    dept_list = list(departments)
                    group_id = f"GRP-{section}-{group_counter:03d}"
                    
                    groups.append(
                        IntegrationGroup(
                            group_id=group_id,
                            section=section,
                            request_ids=req_ids,
                            departments=dept_list,
                            suggested_block_type="INTEGRATED_SHADOW_BLOCK",
                            reason=(
                                f"Multi-department maintenance tasks ({', '.join(dept_list)}) "
                                f"share spatial corridor section {section} with compatible block windows "
                                f"(within {self.max_gap_minutes:.0f}m gap limit). Shadow block coordination recommended."
                            )
                        )
                    )
                    group_counter += 1

        return IntegrationCandidateResponse(
            total_candidates_found=len(groups),
            groups=groups
        )
