import json
import os
from typing import List, Dict, Any
from datetime import datetime
from backend.app.adapters.base import BaseAdapter


class SMMSAdapter(BaseAdapter):
    """
    Simulated SMMS (Signal & Mechanical Management System) Adapter for signal assets, defects & task logs.
    """

    def __init__(
        self,
        assets_file: str = "data/synthetic/assets.json",
        defects_file: str = "data/synthetic/defects.json"
    ):
        super().__init__("SMMS")
        self.assets_file = assets_file
        self.defects_file = defects_file

    async def fetch_data(self) -> List[Dict[str, Any]]:
        results = []
        if os.path.exists(self.defects_file):
            with open(self.defects_file, "r", encoding="utf-8") as f:
                records = json.load(f)
                results.extend([r for r in records if r.get("sourceSystem") == "SMMS"])
        return results

    def normalize_record(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": raw_record.get("id"),
            "defect_code": raw_record.get("defectCode"),
            "asset_id": raw_record.get("assetId"),
            "department": raw_record.get("department", "SIGNAL_TELECOMMUNICATION"),
            "severity": raw_record.get("severity", "MAJOR"),
            "title": raw_record.get("title"),
            "description": raw_record.get("description"),
            "status": raw_record.get("status", "OPEN"),
            "reported_at": raw_record.get("reportedAt"),
            "source_system": "SMMS",
            "source_record_id": raw_record.get("sourceRecordId", f"SMMS-{raw_record.get('defectCode')}"),
            "ingested_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
