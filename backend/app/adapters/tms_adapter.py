import json
import os
from typing import List, Dict, Any
from datetime import datetime
from backend.app.adapters.base import BaseAdapter


class TMSAdapter(BaseAdapter):
    """
    Simulated TMS (Train Management System) Adapter for real-time passenger train status and tracking.
    """

    def __init__(self, data_file_path: str = "data/synthetic/trains.json"):
        super().__init__("TMS")
        self.data_file_path = data_file_path

    async def fetch_data(self) -> List[Dict[str, Any]]:
        if os.path.exists(self.data_file_path):
            with open(self.data_file_path, "r", encoding="utf-8") as f:
                records = json.load(f)
                return [r for r in records if r.get("sourceSystem") == "TMS"]
        return []

    def normalize_record(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": raw_record.get("id"),
            "train_number": raw_record.get("trainNumber"),
            "train_name": raw_record.get("trainName"),
            "train_type": raw_record.get("trainType"),
            "priority": raw_record.get("priority", 5),
            "origin": raw_record.get("origin"),
            "destination": raw_record.get("destination"),
            "scheduled_departure": raw_record.get("scheduledDeparture"),
            "scheduled_arrival": raw_record.get("scheduledArrival"),
            "status": raw_record.get("status", "ON_TIME"),
            "source_system": "TMS",
            "source_record_id": raw_record.get("sourceRecordId", f"TMS-{raw_record.get('trainNumber')}"),
            "ingested_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
