import os
import pytest
from app.core.config import Settings

def test_api_key_secret_from_environment():
    os.environ["API_KEY_SECRET"] = "my-custom-test-secret-123"
    try:
        s = Settings()
        assert s.api_key_secret == "my-custom-test-secret-123"
    finally:
        del os.environ["API_KEY_SECRET"]

def test_no_old_hardcoded_secret():
    s = Settings()
    assert s.api_key_secret != "sih-railopt-dev-secret-key"

def test_production_fails_without_secret():
    os.environ["APP_ENV"] = "production"
    if "API_KEY_SECRET" in os.environ:
        del os.environ["API_KEY_SECRET"]
    
    try:
        with pytest.raises(ValueError, match="API_KEY_SECRET must be explicitly set"):
            Settings(api_key_secret="")
    finally:
        os.environ["APP_ENV"] = "development"

def test_cors_origins_loaded_from_config():
    os.environ["CORS_ALLOWED_ORIGINS"] = "http://frontend.sih.gov.in,http://commandcenter.sih.gov.in"
    try:
        s = Settings()
        origins = s.cors_origins_list
        assert origins == ["http://frontend.sih.gov.in", "http://commandcenter.sih.gov.in"]
    finally:
        del os.environ["CORS_ALLOWED_ORIGINS"]

def test_no_wildcard_cors_in_default_config():
    s = Settings()
    assert "*" not in s.cors_origins_list
    for origin in s.cors_origins_list:
        assert origin != "*"
