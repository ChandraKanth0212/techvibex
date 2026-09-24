from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.defect import DefectModel
from backend.app.repositories.base import BaseRepository


class DefectRepository(BaseRepository[DefectModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(DefectModel, session)
