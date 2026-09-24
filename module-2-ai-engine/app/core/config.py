import os
from pathlib import Path
from typing import Any, Dict, List
import yaml
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_CONFIG_PATH = BASE_DIR / "config" / "scoring_weights.yaml"

class Settings(BaseSettings):
    app_name: str = "RailOpt Module 2 AI Intelligence Engine"
    app_env: str = "development"
    debug: bool = True
    port: int = 8000
    host: str = "0.0.0.0"
    config_path: str = str(DEFAULT_CONFIG_PATH)
    api_key_secret: str = ""
    cors_allowed_origins: str = "http://localhost:3000,http://localhost:5173"
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"

    def __init__(self, **values: Any):
        super().__init__(**values)
        if self.app_env.lower() == "production" and not self.api_key_secret:
            raise ValueError("CRITICAL SECURITY ERROR: API_KEY_SECRET must be explicitly set in environment variables for production.")

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.cors_allowed_origins:
            return ["http://localhost:3000", "http://localhost:5173"]
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

def load_scoring_config(config_file_path: str = None) -> Dict[str, Any]:
    path = Path(config_file_path) if config_file_path else DEFAULT_CONFIG_PATH
    if not path.is_absolute():
        path = BASE_DIR / path
        
    if not path.exists():
        # Fallback to default in-memory config if file missing
        return {
            "version": "2026.1-fallback",
            "weights": {
                "criticality": 0.20,
                "safety_impact": 0.20,
                "defect_severity": 0.15,
                "urgency": 0.15,
                "failure_risk": 0.15,
                "train_exposure": 0.08,
                "operational_impact": 0.07,
            },
            "thresholds": {
                "priority_level": {"critical": 85.0, "high": 65.0, "medium": 40.0},
                "risk_level": {"extreme": 80.0, "high": 60.0, "moderate": 35.0},
                "reason_codes": {
                    "criticality": 75.0, "safety": 70.0, "defect": 80.0,
                    "failure": 70.0, "exposure": 75.0, "operational": 75.0
                }
            },
            "overdue": {"max_multiplier": 2.5, "scaling_days": 14.0},
            "candidate_matching": {"max_time_gap_minutes": 60, "same_section_required": True}
        }
        
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

settings = Settings()
