from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.block_request import BlockRequestModel
from backend.app.repositories.base import BaseRepository


class BlockRequestRepository(BaseRepository[BlockRequestModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(BlockRequestModel, session)
