from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.train import TrainModel
from backend.app.repositories.base import BaseRepository


class TrainRepository(BaseRepository[TrainModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(TrainModel, session)
