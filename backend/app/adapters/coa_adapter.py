import json
import os
from typing import List, Dict, Any
from datetime import datetime
from backend.app.adapters.base import BaseAdapter


class COAAdapter(BaseAdapter):
    """
    Simulated COA (Control Office Application) Adapter for central train control schedules & corridor master data.
    """

    def __init__(self, data_file_path: str = "data/synthetic/corridors.json"):
        super().__init__("COA")
        self.data_file_path = data_file_path

    async def fetch_data(self) -> List[Dict[str, Any]]:
        if os.path.exists(self.data_file_path):
            with open(self.data_file_path, "r", encoding="utf-8") as f:
                records = json.load(f)
                return [r for r in records if r.get("sourceSystem") == "COA"]
        return []

    def normalize_record(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": raw_record.get("id"),
            "corridor_code": raw_record.get("corridorCode"),
            "name": raw_record.get("name"),
            "start_station": raw_record.get("startStation"),
            "end_station": raw_record.get("endStation"),
            "total_length_km": raw_record.get("totalLengthKm"),
            "tracks_count": raw_record.get("tracksCount", 2),
            "electrified": raw_record.get("electrified", True),
            "status": raw_record.get("status", "OPERATIONAL"),
            "source_system": "COA",
            "source_record_id": raw_record.get("sourceRecordId", f"COA-{raw_record.get('corridorCode')}"),
            "ingested_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
