from datetime import timedelta

import pytest
from pydantic import BaseModel

from app.core.config import Settings
from app.integration import AdapterError, AdapterErrorCode, AIPriorityAdapter
from app.services.schedule_optimizer import ScheduleOptimizer
from contracts import PriorityLevel
from tests.helpers import NOW, make_planning_context, sample_block_request, sample_task


TASK_ID = "T-1"


def recommendation(**overrides):
    values = {
        "request_id": TASK_ID,
        "factors": {
            "criticality_score": 82.0,
            "urgency_score": 64.0,
            "defect_severity_score": 70.0,
            "safety_impact_score": 90.0,
            "failure_risk_score": 61.0,
            "overdue_factor": 1.1,
            "train_exposure_score": 48.0,
            "operational_impact_score": 55.0,
        },
        "priority_score": 72.5,
        "priority_level": "HIGH",
        "risk_score": 61.0,
        "risk_level": "HIGH",
        "recommended_action": "schedule inspection",
        "reason_codes": ["HIGH_ASSET_CRITICALITY", "SAFETY_RELATED_DEFECT"],
        "explanation": "The asset has high safety and criticality exposure.",
        "model_version": "2.0.0",
        "scoring_version": "2026.1",
        "generated_at": "2026-01-01T08:00:00Z",
        "integration_candidate": True,
        "integration_group_id": "GROUP-1",
        "integration_reason": "Adjacent tasks share a section.",
    }
    values.update(overrides)
    return values


def test_maps_module_two_recommendation_and_preserves_evidence():
    result = AIPriorityAdapter().adapt_with_metadata(
        recommendation(), known_task_ids=[TASK_ID]
    )

    assert result.task_id == TASK_ID
    assert result.priority_score == 72.5
    assert result.recommended_priority is PriorityLevel.HIGH
    assert result.confidence is None
    assert result.rationale == "The asset has high safety and criticality exposure."
    assert result.model_version == "2.0.0"
    assert result.evidence["risk_score"] == 61.0
    assert result.evidence["risk_level"] == "HIGH"
    assert result.evidence["factors"] == recommendation()["factors"]
    assert result.evidence["recommended_action"] == "schedule inspection"
    assert result.evidence["reason_codes"] == recommendation()["reason_codes"]
    assert result.evidence["integration_group_id"] == "GROUP-1"
    assert result.metadata["source_recommendation"]["request_id"] == TASK_ID
    assert result.provenance["source_module"] == "module-2-ai-engine"


@pytest.mark.parametrize("level", ["LOW", "MEDIUM", "HIGH"])
def test_maps_supported_priority_levels(level):
    result = AIPriorityAdapter().adapt(
        recommendation(priority_level=level), known_task_ids=[TASK_ID]
    )

    assert result.recommended_priority is PriorityLevel(level)


@pytest.mark.parametrize("level", ["CRITICAL", "URGENT"])
def test_rejects_priority_levels_without_explicit_target_mapping(level):
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(
            recommendation(priority_level=level), known_task_ids=[TASK_ID]
        )

    assert exc_info.value.code == AdapterErrorCode.UNSUPPORTED_MAPPING
    assert exc_info.value.field == "priority_level"


def test_rejects_unknown_priority_level():
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(
            recommendation(priority_level="SEVERE"), known_task_ids=[TASK_ID]
        )

    assert exc_info.value.code == AdapterErrorCode.INVALID_ENUM


@pytest.mark.parametrize("score", [-0.1, 100.1, "high"])
def test_rejects_invalid_priority_score(score):
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(
            recommendation(priority_score=score), known_task_ids=[TASK_ID]
        )

    assert exc_info.value.code == AdapterErrorCode.INVALID_TYPE


def test_rejects_invalid_confidence_without_deriving_one():
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(
            recommendation(confidence=1.1), known_task_ids=[TASK_ID]
        )

    assert exc_info.value.code == AdapterErrorCode.INVALID_TYPE
    assert exc_info.value.field == "confidence"


def test_rejects_invalid_risk_score():
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(
            recommendation(risk_score=101), known_task_ids=[TASK_ID]
        )

    assert exc_info.value.code == AdapterErrorCode.INVALID_TYPE
    assert exc_info.value.field == "risk_score"


def test_rejects_invalid_factor_score():
    factors = recommendation()["factors"] | {"safety_impact_score": 101}
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(
            recommendation(factors=factors), known_task_ids=[TASK_ID]
        )

    assert exc_info.value.code == AdapterErrorCode.INVALID_TYPE
    assert exc_info.value.field == "factors.safety_impact_score"


def test_rejects_missing_request_id():
    values = recommendation()
    del values["request_id"]
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(values, known_task_ids=[TASK_ID])

    assert exc_info.value.code == AdapterErrorCode.MISSING_REQUIRED_FIELD
    assert exc_info.value.field == "request_id"


def test_rejects_conflicting_aliases():
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(
            recommendation(task_id="T-2", priority_score=72.5),
            known_task_ids=[TASK_ID],
        )

    assert exc_info.value.code == AdapterErrorCode.AMBIGUOUS_MAPPING
    assert exc_info.value.field == "request_id"


def test_rejects_optimizer_owned_fields_at_the_module_boundary():
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(
            recommendation(final_block_start="2026-01-01T09:00:00Z"),
            known_task_ids=[TASK_ID],
        )

    assert exc_info.value.code == AdapterErrorCode.UNSUPPORTED_MAPPING
    assert exc_info.value.field == "final_block_start"


def test_rejects_unknown_task_relationship():
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(recommendation(), known_task_ids=["T-2"])

    assert exc_info.value.code == AdapterErrorCode.UNRESOLVED_RELATIONSHIP
    assert exc_info.value.field == "task_id"


def test_requires_a_task_catalog():
    with pytest.raises(AdapterError) as exc_info:
        AIPriorityAdapter().adapt(recommendation())

    assert exc_info.value.code == AdapterErrorCode.MISSING_REQUIRED_FIELD
    assert exc_info.value.field == "known_task_ids"


def test_accepts_task_objects_and_context_catalogs():
    task = sample_task(task_id=TASK_ID)
    result = AIPriorityAdapter().adapt(recommendation(), context=make_planning_context(tasks=[task]))
    assert result.task_id == TASK_ID

    result = AIPriorityAdapter(known_tasks=[task]).adapt(recommendation())
    assert result.task_id == TASK_ID


def test_accepts_pydantic_source_and_preserves_optional_recommendation_id():
    class Source(BaseModel):
        request_id: str
        priority_score: float
        priority_level: str
        explanation: str
        recommendation_id: str | None = None

    source = Source(
        request_id=TASK_ID,
        priority_score=72.5,
        priority_level="HIGH",
        explanation="source explanation",
        recommendation_id="REC-1",
    )
    result = AIPriorityAdapter().adapt_with_metadata(
        source, known_task_ids=[TASK_ID]
    )

    assert result.model.recommendation_id == "REC-1"
    assert result.model.evidence["recommendation_id"] == "REC-1"
    assert result.provenance["recommendation_id"] == "REC-1"


def test_adapted_result_feeds_schedule_optimizer():
    task = sample_task(
        task_id=TASK_ID,
        window_start=NOW,
        window_end=NOW + timedelta(hours=2),
    )
    result = AIPriorityAdapter().adapt(recommendation(), known_task_ids=[task])
    context = make_planning_context(tasks=[task], priorities=[result])
    optimized = ScheduleOptimizer(settings=Settings()).optimize(
        sample_block_request(request_id="REQ-1", task_ids=[TASK_ID]), context
    )

    assert optimized.status == "OPTIMAL"
    assert optimized.solver_metadata["priority_source"] == "ai"
    assert optimized.scheduled_task_ids == [TASK_ID]
