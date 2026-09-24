from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.goods_forecast import GoodsForecastModel
from backend.app.repositories.base import BaseRepository


class GoodsForecastRepository(BaseRepository[GoodsForecastModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(GoodsForecastModel, session)
