from typing import List, Dict, Any
from app.core.config import load_scoring_config
from app.schemas.source_data import MaintenanceTaskInput
from app.schemas.ai_output import AIRecommendation
from app.scoring.composite_scorer import CompositeScorer
from app.services.risk_service import RiskService
from app.explainability.generator import ExplainabilityGenerator
from app.services.candidate_service import CandidateService

class ScoringService:
    """Primary pipeline orchestrator for Module 2 AI Intelligence Engine"""
    
    def __init__(self, config_path: str = None):
        self.config = load_scoring_config(config_path)
        self.composite_scorer = CompositeScorer(self.config)
        self.risk_service = RiskService(self.config)
        self.explainability_generator = ExplainabilityGenerator(self.config)
        self.candidate_service = CandidateService(self.config)

    def evaluate_task(self, task: MaintenanceTaskInput) -> AIRecommendation:
        # Step 1: Compute factor scores & composite priority
        priority_score, priority_level, factors = self.composite_scorer.evaluate(task)
        
        # Step 2: Compute ISO 31000 Failure Risk
        risk_score, risk_level = self.risk_service.evaluate_risk(task, factors)
        
        # Step 3: Generate reason codes & plain English explanation
        reason_codes, recommended_action, explanation = self.explainability_generator.generate(
            task, factors, priority_score, priority_level, risk_level
        )

        return AIRecommendation(
            request_id=task.request_id,
            factors=factors,
            priority_score=priority_score,
            priority_level=priority_level,
            risk_score=risk_score,
            risk_level=risk_level,
            recommended_action=recommended_action,
            reason_codes=reason_codes,
            explanation=explanation,
            integration_candidate=False,
            integration_group_id=None,
            integration_reason=None,
            model_version="1.0.0-prototype",
            scoring_version=self.config.get("version", "2026.1")
        )

    def evaluate_batch(self, tasks: List[MaintenanceTaskInput]) -> List[AIRecommendation]:
        # Step 1: Evaluate each task individually
        recommendations = [self.evaluate_task(t) for t in tasks]
        
        # Step 2: Run candidate integration detection across the batch
        candidates_resp = self.candidate_service.find_integration_candidates(tasks)
        
        # Step 3: Enrich recommendations with candidate grouping information
        group_map = {}
        reason_map = {}
        for group in candidates_resp.groups:
            for req_id in group.request_ids:
                group_map[req_id] = group.group_id
                reason_map[req_id] = group.reason

        for rec in recommendations:
            if rec.request_id in group_map:
                rec.integration_candidate = True
                rec.integration_group_id = group_map[rec.request_id]
                rec.integration_reason = reason_map[rec.request_id]

        return recommendations
