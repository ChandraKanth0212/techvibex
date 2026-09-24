from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.resource import ResourceModel
from backend.app.repositories.base import BaseRepository


class ResourceRepository(BaseRepository[ResourceModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(ResourceModel, session)
