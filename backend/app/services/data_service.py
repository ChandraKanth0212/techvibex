import os
import json
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.app.models.asset import AssetModel
from backend.app.models.maintenance import MaintenanceTaskModel
from backend.app.models.defect import DefectModel
from backend.app.models.block_request import BlockRequestModel
from backend.app.models.corridor import CorridorModel
from backend.app.models.train import TrainModel
from backend.app.models.goods_forecast import GoodsForecastModel
from backend.app.models.resource import ResourceModel

DATA_SYNTHETIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/synthetic"))


class DataHubService:
    @staticmethod
    async def seed_synthetic_data_if_empty(session: AsyncSession) -> Dict[str, int]:
        """
        Seeds synthetic data into the database if tables are empty.
        """
        counts = {}

        # 1. Corridors
        corridor_count = await session.scalar(select(func.count()).select_from(CorridorModel))
        if corridor_count == 0:
            file_path = os.path.join(DATA_SYNTHETIC_DIR, "corridors.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        session.add(CorridorModel(
                            id=item["id"],
                            corridor_code=item["corridorCode"],
                            name=item["name"],
                            start_station=item["startStation"],
                            end_station=item["endStation"],
                            total_length_km=item["totalLengthKm"],
                            tracks_count=item.get("tracksCount", 2),
                            electrified=item.get("electrified", True),
                            status=item.get("status", "OPERATIONAL"),
                            source_system=item.get("sourceSystem", "COA"),
                            source_record_id=item.get("sourceRecordId", f"COA-{item['corridorCode']}")
                        ))
        counts["corridors"] = await session.scalar(select(func.count()).select_from(CorridorModel)) or 0

        # 2. Assets
        asset_count = await session.scalar(select(func.count()).select_from(AssetModel))
        if asset_count == 0:
            file_path = os.path.join(DATA_SYNTHETIC_DIR, "assets.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        session.add(AssetModel(
                            id=item["id"],
                            asset_code=item["assetCode"],
                            name=item["name"],
                            asset_type=item["assetType"],
                            location=item["location"],
                            line_section=item["lineSection"],
                            latitude=item.get("latitude"),
                            longitude=item.get("longitude"),
                            status=item.get("status", "OPERATIONAL"),
                            department=item["department"],
                            source_system=item.get("sourceSystem", "SMMS"),
                            source_record_id=item.get("sourceRecordId", f"SMMS-{item['assetCode']}")
                        ))
        counts["assets"] = await session.scalar(select(func.count()).select_from(AssetModel)) or 0

        # 3. Maintenance Tasks
        task_count = await session.scalar(select(func.count()).select_from(MaintenanceTaskModel))
        if task_count == 0:
            file_path = os.path.join(DATA_SYNTHETIC_DIR, "maintenance_tasks.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        session.add(MaintenanceTaskModel(
                            id=item["id"],
                            task_code=item["taskCode"],
                            department=item["department"],
                            title=item["title"],
                            description=item.get("description"),
                            asset_id=item.get("assetId"),
                            corridor_id=item["corridorId"],
                            status=item.get("status", "PLANNED"),
                            priority=item.get("priority", "MEDIUM"),
                            estimated_duration_minutes=item["estimatedDurationMinutes"],
                            required_resources=item.get("requiredResources", []),
                            source_system=item.get("sourceSystem", "BDMS"),
                            source_record_id=item.get("sourceRecordId", f"BDMS-{item['taskCode']}")
                        ))
        counts["maintenance_tasks"] = await session.scalar(select(func.count()).select_from(MaintenanceTaskModel)) or 0

        # 4. Defects
        defect_count = await session.scalar(select(func.count()).select_from(DefectModel))
        if defect_count == 0:
            file_path = os.path.join(DATA_SYNTHETIC_DIR, "defects.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        session.add(DefectModel(
                            id=item["id"],
                            defect_code=item["defectCode"],
                            asset_id=item["assetId"],
                            department=item["department"],
                            severity=item["severity"],
                            title=item["title"],
                            description=item.get("description"),
                            status=item.get("status", "OPEN"),
                            source_system=item.get("sourceSystem", "SMMS"),
                            source_record_id=item.get("sourceRecordId", f"SMMS-{item['defectCode']}")
                        ))
        counts["defects"] = await session.scalar(select(func.count()).select_from(DefectModel)) or 0

        # 5. Block Requests
        block_count = await session.scalar(select(func.count()).select_from(BlockRequestModel))
        if block_count == 0:
            file_path = os.path.join(DATA_SYNTHETIC_DIR, "block_requests.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        from datetime import datetime
                        session.add(BlockRequestModel(
                            id=item["id"],
                            request_code=item["requestCode"],
                            department=item["department"],
                            corridor_id=item["corridorId"],
                            asset_ids=item.get("assetIds", []),
                            requested_start_time=datetime.fromisoformat(item["requestedStartTime"].replace("Z", "+00:00")),
                            requested_end_time=datetime.fromisoformat(item["requestedEndTime"].replace("Z", "+00:00")),
                            min_duration_minutes=item["minDurationMinutes"],
                            flexible=item.get("flexible", True),
                            status=item.get("status", "SUBMITTED"),
                            source_system=item.get("sourceSystem", "BDMS"),
                            source_record_id=item.get("sourceRecordId", f"BDMS-{item['requestCode']}")
                        ))
        counts["block_requests"] = await session.scalar(select(func.count()).select_from(BlockRequestModel)) or 0

        # 6. Trains
        train_count = await session.scalar(select(func.count()).select_from(TrainModel))
        if train_count == 0:
            file_path = os.path.join(DATA_SYNTHETIC_DIR, "trains.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        from datetime import datetime
                        session.add(TrainModel(
                            id=item["id"],
                            train_number=item["trainNumber"],
                            train_name=item["trainName"],
                            train_type=item["trainType"],
                            priority=item.get("priority", 5),
                            origin=item["origin"],
                            destination=item["destination"],
                            scheduled_departure=datetime.fromisoformat(item["scheduledDeparture"].replace("Z", "+00:00")),
                            scheduled_arrival=datetime.fromisoformat(item["scheduledArrival"].replace("Z", "+00:00")),
                            status=item.get("status", "ON_TIME"),
                            source_system=item.get("sourceSystem", "TMS"),
                            source_record_id=item.get("sourceRecordId", f"TMS-{item['trainNumber']}")
                        ))
        counts["trains"] = await session.scalar(select(func.count()).select_from(TrainModel)) or 0

        # 7. Goods Forecasts
        goods_count = await session.scalar(select(func.count()).select_from(GoodsForecastModel))
        if goods_count == 0:
            file_path = os.path.join(DATA_SYNTHETIC_DIR, "goods_forecasts.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        from datetime import datetime
                        session.add(GoodsForecastModel(
                            id=item["id"],
                            forecast_code=item["forecastCode"],
                            origin_hub=item["originHub"],
                            destination_hub=item["destinationHub"],
                            corridor_id=item["corridorId"],
                            estimated_departure=datetime.fromisoformat(item["estimatedDeparture"].replace("Z", "+00:00")),
                            estimated_arrival=datetime.fromisoformat(item["estimatedArrival"].replace("Z", "+00:00")),
                            cargo_type=item["cargoType"],
                            priority=item.get("priority", 5),
                            status=item.get("status", "FORECASTED"),
                            source_system=item.get("sourceSystem", "GOODS_FORECAST"),
                            source_record_id=item.get("sourceRecordId", f"GFC-{item['forecastCode']}")
                        ))
        counts["goods_forecasts"] = await session.scalar(select(func.count()).select_from(GoodsForecastModel)) or 0

        # 8. Resources
        resource_count = await session.scalar(select(func.count()).select_from(ResourceModel))
        if resource_count == 0:
            file_path = os.path.join(DATA_SYNTHETIC_DIR, "resources.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        session.add(ResourceModel(
                            id=item["id"],
                            resource_code=item["resourceCode"],
                            name=item["name"],
                            resource_type=item["resourceType"],
                            department=item["department"],
                            location=item["location"],
                            status=item.get("status", "AVAILABLE"),
                            total_quantity=item.get("totalQuantity", 1),
                            available_quantity=item.get("availableQuantity", 1),
                            source_system=item.get("sourceSystem", "BDMS"),
                            source_record_id=item.get("sourceRecordId", f"BDMS-{item['resourceCode']}")
                        ))
        counts["resources"] = await session.scalar(select(func.count()).select_from(ResourceModel)) or 0

        await session.commit()
        return counts
