"""Tests proving configuration loads and honours environment variables."""

from app.core.config import ObjectiveWeights, Settings, get_settings, reload_settings
from app.models import DataMode


def test_defaults_load():
    settings = Settings()
    assert settings.safety_buffer_minutes == 15
    assert settings.solver_timeout_seconds == 30
    assert settings.planning_horizon_days == 7
    assert settings.demo_mode is True
    assert settings.data_mode == DataMode.SYNTHETIC_DEMO


def test_phase2_generation_defaults_load():
    settings = Settings()
    assert settings.candidate_step_minutes == 30
    assert settings.max_candidates_per_task == 50
    assert settings.goods_forecast_probability_threshold == 0.60
    assert settings.goods_forecast_peak_threshold == 0.85


def test_phase2_generation_defaults_via_env(monkeypatch):
    monkeypatch.setenv("RAILOPT_CANDIDATE_STEP_MINUTES", "15")
    monkeypatch.setenv("RAILOPT_MAX_CANDIDATES_PER_TASK", "10")
    settings = Settings.from_env()
    assert settings.candidate_step_minutes == 15
    assert settings.max_candidates_per_task == 10


def test_phase3a_detection_defaults_load():
    settings = Settings()
    assert settings.max_integrated_group_size == 5
    assert settings.max_integrated_groups == 200
    assert settings.max_placements_per_group == 1000


def test_phase3a_detection_defaults_via_env(monkeypatch):
    monkeypatch.setenv("RAILOPT_MAX_INTEGRATED_GROUP_SIZE", "3")
    monkeypatch.setenv("RAILOPT_MAX_INTEGRATED_GROUPS", "10")
    monkeypatch.setenv("RAILOPT_MAX_PLACEMENTS_PER_GROUP", "25")
    settings = Settings.from_env()
    assert settings.max_integrated_group_size == 3
    assert settings.max_integrated_groups == 10
    assert settings.max_placements_per_group == 25


def test_objective_weights_defaults():
    weights = settings = Settings().objective_weights
    assert settings.slot_consolidation == 1.0
    assert settings.priority_adherence == 1.0


def test_objective_weights_validate_bounds():
    weights = ObjectiveWeights(
        slot_consolidation=0.0,
        priority_adherence=0.5,
        forecast_alignment=2.5,
        resource_efficiency=1.0,
    )
    assert weights.forecast_alignment == 2.5


def test_data_mode_reflects_demo_flag():
    assert Settings(demo_mode=True).data_mode == DataMode.SYNTHETIC_DEMO
    assert Settings(demo_mode=False).data_mode == DataMode.PRODUCTION


def test_from_env_overrides(monkeypatch):
    monkeypatch.setenv("RAILOPT_DEMO_MODE", "false")
    monkeypatch.setenv("RAILOPT_SAFETY_BUFFER_MINUTES", "25")
    monkeypatch.setenv("RAILOPT_SOLVER_TIMEOUT_SECONDS", "60")
    settings = Settings.from_env()
    assert settings.demo_mode is False
    assert settings.safety_buffer_minutes == 25
    assert settings.solver_timeout_seconds == 60


def test_from_env_keeps_defaults_when_absent(monkeypatch):
    monkeypatch.delenv("RAILOPT_DEMO_MODE", raising=False)
    monkeypatch.delenv("RAILOPT_SAFETY_BUFFER_MINUTES", raising=False)
    settings = Settings.from_env()
    assert settings.demo_mode is True
    assert settings.safety_buffer_minutes == 15


def test_get_settings_singleton():
    reload_settings()
    first = get_settings()
    second = get_settings()
    assert first is second
    reload_settings()