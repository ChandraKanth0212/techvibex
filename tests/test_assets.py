import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_assets(client: AsyncClient):
    response = await client.get("/api/assets")
    assert response.status_code == 200
    assets = response.json()
    assert isinstance(assets, list)
    assert len(assets) > 0


@pytest.mark.asyncio
async def test_get_asset_by_id(client: AsyncClient):
    # Fetch list first
    res_list = await client.get("/api/assets")
    assets = res_list.json()
    first_id = assets[0]["id"]

    response = await client.get(f"/api/assets/{first_id}")
    assert response.status_code == 200
    asset = response.json()
    assert asset["id"] == first_id
    assert "sourceSystem" in asset
    assert "sourceRecordId" in asset


@pytest.mark.asyncio
async def test_get_asset_not_found(client: AsyncClient):
    response = await client.get("/api/assets/non-existent-uuid")
    assert response.status_code == 404
