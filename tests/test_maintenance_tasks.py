import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_maintenance_tasks(client: AsyncClient):
    response = await client.get("/api/maintenance/tasks")
    assert response.status_code == 200
    tasks = response.json()
    assert isinstance(tasks, list)
    assert len(tasks) > 0


@pytest.mark.asyncio
async def test_get_maintenance_task_by_id(client: AsyncClient):
    res_list = await client.get("/api/maintenance/tasks")
    tasks = res_list.json()
    first_id = tasks[0]["id"]

    response = await client.get(f"/api/maintenance/tasks/{first_id}")
    assert response.status_code == 200
    task = response.json()
    assert task["id"] == first_id


@pytest.mark.asyncio
async def test_create_maintenance_task(client: AsyncClient):
    # Fetch corridor ID for valid foreign relation
    res_corr = await client.get("/api/corridors")
    corridors = res_corr.json()
    corr_id = corridors[0]["id"]

    payload = {
        "taskCode": "TSK-TEST-999",
        "department": "ENGINEERING",
        "title": "Automated Unit Test Track Welding",
        "description": "Test maintenance task creation",
        "corridorId": corr_id,
        "status": "PLANNED",
        "priority": "HIGH",
        "estimatedDurationMinutes": 120,
        "sourceSystem": "BDMS",
        "sourceRecordId": "BDMS-TST-999"
    }

    response = await client.post("/api/maintenance/tasks", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert created["taskCode"] == "TSK-TEST-999"
    assert created["department"] == "ENGINEERING"
    assert created["sourceSystem"] == "BDMS"
