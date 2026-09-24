import json
import os
from typing import List, Dict, Any
from datetime import datetime
from backend.app.adapters.base import BaseAdapter


class BDMSAdapter(BaseAdapter):
    """
    Simulated BDMS (Block & Maintenance Management System) Adapter for Engineering track block requests.
    """

    def __init__(self, data_file_path: str = "data/synthetic/block_requests.json"):
        super().__init__("BDMS")
        self.data_file_path = data_file_path

    async def fetch_data(self) -> List[Dict[str, Any]]:
        if os.path.exists(self.data_file_path):
            with open(self.data_file_path, "r", encoding="utf-8") as f:
                records = json.load(f)
                return [r for r in records if r.get("sourceSystem") == "BDMS"]
        return []

    def normalize_record(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": raw_record.get("id"),
            "request_code": raw_record.get("requestCode"),
            "department": raw_record.get("department", "ENGINEERING"),
            "corridor_id": raw_record.get("corridorId"),
            "asset_ids": raw_record.get("assetIds", []),
            "requested_start_time": raw_record.get("requestedStartTime"),
            "requested_end_time": raw_record.get("requestedEndTime"),
            "min_duration_minutes": raw_record.get("minDurationMinutes", 120),
            "flexible": raw_record.get("flexible", True),
            "status": raw_record.get("status", "SUBMITTED"),
            "source_system": "BDMS",
            "source_record_id": raw_record.get("sourceRecordId", f"BDMS-{raw_record.get('requestCode')}"),
            "ingested_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
