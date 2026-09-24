from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.maintenance import MaintenanceTaskModel
from backend.app.repositories.base import BaseRepository


class MaintenanceTaskRepository(BaseRepository[MaintenanceTaskModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(MaintenanceTaskModel, session)
