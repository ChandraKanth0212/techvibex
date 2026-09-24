import json
import os
from typing import List, Dict, Any
from datetime import datetime
from backend.app.adapters.base import BaseAdapter


class GoodsForecastAdapter(BaseAdapter):
    """
    Simulated Goods Forecast Adapter for freight rake demand and movement projections.
    """

    def __init__(self, data_file_path: str = "data/synthetic/goods_forecasts.json"):
        super().__init__("GOODS_FORECAST")
        self.data_file_path = data_file_path

    async def fetch_data(self) -> List[Dict[str, Any]]:
        if os.path.exists(self.data_file_path):
            with open(self.data_file_path, "r", encoding="utf-8") as f:
                records = json.load(f)
                return [r for r in records if r.get("sourceSystem") == "GOODS_FORECAST"]
        return []

    def normalize_record(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": raw_record.get("id"),
            "forecast_code": raw_record.get("forecastCode"),
            "origin_hub": raw_record.get("originHub"),
            "destination_hub": raw_record.get("destinationHub"),
            "corridor_id": raw_record.get("corridorId"),
            "estimated_departure": raw_record.get("estimatedDeparture"),
            "estimated_arrival": raw_record.get("estimatedArrival"),
            "cargo_type": raw_record.get("cargoType"),
            "priority": raw_record.get("priority", 5),
            "status": raw_record.get("status", "FORECASTED"),
            "source_system": "GOODS_FORECAST",
            "source_record_id": raw_record.get("sourceRecordId", f"GFC-{raw_record.get('forecastCode')}"),
            "ingested_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
