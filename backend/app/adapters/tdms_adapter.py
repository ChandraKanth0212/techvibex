import json
import os
from typing import List, Dict, Any
from datetime import datetime
from backend.app.adapters.base import BaseAdapter


class TDMSAdapter(BaseAdapter):
    """
    Simulated TDMS (Traction & Distribution Management System) Adapter for overhead electric (OHE) traction infrastructure.
    """

    def __init__(self, data_file_path: str = "data/synthetic/maintenance_tasks.json"):
        super().__init__("TDMS")
        self.data_file_path = data_file_path

    async def fetch_data(self) -> List[Dict[str, Any]]:
        if os.path.exists(self.data_file_path):
            with open(self.data_file_path, "r", encoding="utf-8") as f:
                records = json.load(f)
                return [r for r in records if r.get("sourceSystem") == "TDMS"]
        return []

    def normalize_record(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": raw_record.get("id"),
            "task_code": raw_record.get("taskCode"),
            "department": "TRACTION",
            "title": raw_record.get("title"),
            "description": raw_record.get("description"),
            "asset_id": raw_record.get("assetId"),
            "corridor_id": raw_record.get("corridorId"),
            "status": raw_record.get("status", "PLANNED"),
            "priority": raw_record.get("priority", "MEDIUM"),
            "estimated_duration_minutes": raw_record.get("estimatedDurationMinutes", 120),
            "start_time_window": raw_record.get("startTimeWindow"),
            "end_time_window": raw_record.get("endTimeWindow"),
            "required_resources": raw_record.get("requiredResources", []),
            "source_system": "TDMS",
            "source_record_id": raw_record.get("sourceRecordId", f"TDMS-{raw_record.get('taskCode')}"),
            "ingested_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
