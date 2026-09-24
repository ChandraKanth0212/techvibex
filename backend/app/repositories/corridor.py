from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.corridor import CorridorModel
from backend.app.repositories.base import BaseRepository


class CorridorRepository(BaseRepository[CorridorModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(CorridorModel, session)
