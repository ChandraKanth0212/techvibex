from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.asset import AssetModel
from backend.app.repositories.base import BaseRepository


class AssetRepository(BaseRepository[AssetModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(AssetModel, session)
