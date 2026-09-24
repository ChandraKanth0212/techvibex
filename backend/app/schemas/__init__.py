from backend.app.schemas.base import DepartmentEnum, SourceSystemEnum
from backend.app.schemas.asset import AssetCreate, AssetRead, AssetUpdate
from backend.app.schemas.maintenance import MaintenanceTaskCreate, MaintenanceTaskRead, MaintenanceTaskUpdate
from backend.app.schemas.defect import DefectCreate, DefectRead, DefectUpdate
from backend.app.schemas.block_request import BlockRequestCreate, BlockRequestRead, BlockRequestUpdate
from backend.app.schemas.corridor import CorridorCreate, CorridorRead
from backend.app.schemas.train import TrainCreate, TrainRead
from backend.app.schemas.goods_forecast import GoodsForecastCreate, GoodsForecastRead
from backend.app.schemas.resource import ResourceCreate, ResourceRead

__all__ = [
    "DepartmentEnum",
    "SourceSystemEnum",
    "AssetCreate",
    "AssetRead",
    "AssetUpdate",
    "MaintenanceTaskCreate",
    "MaintenanceTaskRead",
    "MaintenanceTaskUpdate",
    "DefectCreate",
    "DefectRead",
    "DefectUpdate",
    "BlockRequestCreate",
    "BlockRequestRead",
    "BlockRequestUpdate",
    "CorridorCreate",
    "CorridorRead",
    "TrainCreate",
    "TrainRead",
    "GoodsForecastCreate",
    "GoodsForecastRead",
    "ResourceCreate",
    "ResourceRead",
]
