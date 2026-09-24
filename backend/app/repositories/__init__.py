from backend.app.repositories.base import BaseRepository
from backend.app.repositories.asset import AssetRepository
from backend.app.repositories.maintenance import MaintenanceTaskRepository
from backend.app.repositories.defect import DefectRepository
from backend.app.repositories.block_request import BlockRequestRepository
from backend.app.repositories.corridor import CorridorRepository
from backend.app.repositories.train import TrainRepository
from backend.app.repositories.goods_forecast import GoodsForecastRepository
from backend.app.repositories.resource import ResourceRepository

__all__ = [
    "BaseRepository",
    "AssetRepository",
    "MaintenanceTaskRepository",
    "DefectRepository",
    "BlockRequestRepository",
    "CorridorRepository",
    "TrainRepository",
    "GoodsForecastRepository",
    "ResourceRepository",
]
