"""Tests proving the FastAPI application starts and serves /health."""

from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings

EXPECTED_DEMO_BODY = {
    "status": "ok",
    "module": "optimization-engine",
    "dataMode": "SYNTHETIC_DEMO",
}


def test_app_starts_and_health_returns_200():
    client = TestClient(create_app(settings=Settings(demo_mode=True)))
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == EXPECTED_DEMO_BODY


def test_health_reflects_production_mode():
    client = TestClient(create_app(settings=Settings(demo_mode=False)))
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["module"] == "optimization-engine"
    assert body["dataMode"] == "PRODUCTION"


def test_unknown_route_returns_404():
    client = TestClient(create_app(settings=Settings()))
    assert client.get("/does-not-exist").status_code == 404