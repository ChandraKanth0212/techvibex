"""Tests proving the Pydantic contracts load and validate."""

from datetime import time as t

import pytest
from pydantic import ValidationError

import contracts as c
from tests.helpers import (
    NOW,
    sample_asset,
    sample_block_request,
    sample_corridor,
    sample_defect,
    sample_existing_block,
    sample_goods_forecast,
    sample_resource,
    sample_task,
    sample_train_movement,
)


def test_core_schemas_load_and_instantiate():
    result = {
        "Asset": sample_asset(),
        "MaintenanceTask": sample_task(),
        "BlockRequest": sample_block_request(),
        "Corridor": sample_corridor(),
        "TrainMovement": sample_train_movement(),
        "GoodsForecast": sample_goods_forecast(),
        "Resource": sample_resource(),
        "ExistingBlock": sample_existing_block(),
        "Defect": sample_defect(),
    }
    for name, model in result.items():
        assert model is not None
        assert type(model).model_fields, f"{name} defined no fields"


def test_priority_result_aliasses_ai_recommendation():
    rec = c.AIRecommendation(
        task_id="TSK-9",
        priority_score=92.0,
        recommended_priority="URGENT",
        confidence=0.97,
    )
    assert c.PriorityResult is c.AIRecommendation
    assert rec.model_dump()["task_id"] == "TSK-9"


def test_auxiliary_schemas_are_exported():
    for name in [
        "BlockCandidate",
        "IntegratedBlock",
        "ConstraintViolation",
        "ScheduleSolution",
        "OptimizationResult",
        "ScheduleMetrics",
        "ValidationReport",
    ]:
        assert hasattr(c, name)


def test_invalid_probability_rejected():
    with pytest.raises(ValidationError):
        sample_goods_forecast(probability=1.5)


def test_invalid_duration_rejected():
    with pytest.raises(ValidationError):
        sample_task(estimated_duration_minutes=0)


def test_inverted_task_window_rejected():
    with pytest.raises(ValidationError):
        sample_block_request(requested_start=NOW, requested_end=NOW)
    with pytest.raises(ValidationError):
        sample_task(window_start=NOW, window_end=NOW)


def test_inverted_train_movement_rejected():
    with pytest.raises(ValidationError):
        sample_train_movement(departure=NOW, arrival=NOW)


def test_inverted_goods_forecast_window_rejected():
    with pytest.raises(ValidationError):
        sample_goods_forecast(window_start=t(12, 0), window_end=t(9, 0))


def test_inverted_existing_block_rejected():
    with pytest.raises(ValidationError):
        sample_existing_block(start_time=NOW, end_time=NOW)