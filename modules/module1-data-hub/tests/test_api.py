import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_health_check_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"


def test_network_snapshot_endpoint():
    response = client.get("/api/v1/state/snapshot")
    assert response.status_code == 200
    data = response.json()
    assert "snapshot_id" in data
    assert "active_trains" in data


def test_infrastructure_stations_endpoint():
    response = client.get("/api/v1/infrastructure/stations")
    assert response.status_code == 200
    stations = response.json()
    assert len(stations) >= 5
    assert stations[0]["code"] == "NDLS"


def test_rtis_ingest_endpoint():
    payload = {
        "train_number": "12951",
        "lat": 28.64,
        "lon": 77.21,
        "speed": 115.0
    }
    response = client.post("/api/v1/ingest/rtis", json=payload)
    assert response.status_code == 201
    assert response.json()["status"] == "SUCCESS"
