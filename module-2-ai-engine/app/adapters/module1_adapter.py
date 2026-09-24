"""
Module 1 → Module 2 Data Boundary Adapter.

Translates raw/synthetic source system data (TMS, SMMS, TDMS, BDMS, COA)
into canonical MaintenanceTaskInput models consumed by Module 2 AI Engine.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from app.schemas.source_data import MaintenanceTaskInput
from app.models.enums import Department, BlockType
from app.core.exceptions import SchemaValidationException

class Module1InputAdapter:
    """Adapter service converting source payloads into canonical Pydantic v2 task inputs."""
    
    @staticmethod
    def adapt_source_payload(raw_data: Dict[str, Any]) -> MaintenanceTaskInput:
        """
        Adapts raw source dictionary into canonical MaintenanceTaskInput.
        Safely validates required fields and handles missing optional domain metrics.
        """
        if not isinstance(raw_data, dict):
            raise SchemaValidationException(
                message="Invalid payload structure: raw source data must be a JSON object",
                details={"received_type": type(raw_data).__name__}
            )
            
        required_fields = ["request_id", "department", "asset_id", "asset_type", "section", "location", "work_type", "description", "duration_minutes"]
        missing = [f for f in required_fields if f not in raw_data or raw_data[f] is None]
        if missing:
            raise SchemaValidationException(
                message=f"Missing required canonical task fields: {', '.join(missing)}",
                details={"missing_fields": missing}
            )

        try:
            # Normalize department enum
            dept_str = str(raw_data["department"]).upper().strip()
            department = Department(dept_str)
        except ValueError:
            raise SchemaValidationException(
                message=f"Invalid department identifier: '{raw_data.get('department')}'",
                details={"allowed_departments": [d.value for d in Department]}
            )

        # Parse preferred start and end datetimes safely
        pref_start = Module1InputAdapter._parse_datetime(raw_data.get("preferred_start"))
        pref_end = Module1InputAdapter._parse_datetime(raw_data.get("preferred_end"))

        if pref_start and pref_end and pref_end <= pref_start:
            raise SchemaValidationException(
                message="Invalid date window: preferred_end must be strictly after preferred_start",
                details={"preferred_start": str(pref_start), "preferred_end": str(pref_end)}
            )

        # Parse block type
        block_type_val = raw_data.get("block_type", "CORRIDOR_BLOCK")
        try:
            block_type = BlockType(block_type_val) if isinstance(block_type_val, str) else block_type_val
        except ValueError:
            block_type = BlockType.CORRIDOR_BLOCK

        return MaintenanceTaskInput(
            request_id=str(raw_data["request_id"]).strip(),
            department=department,
            asset_id=str(raw_data["asset_id"]).strip(),
            asset_type=str(raw_data["asset_type"]).strip(),
            section=str(raw_data["section"]).strip(),
            location=str(raw_data["location"]).strip(),
            work_type=str(raw_data["work_type"]).strip(),
            description=str(raw_data["description"]).strip(),
            duration_minutes=int(raw_data["duration_minutes"]),
            criticality=raw_data.get("criticality", 50.0),
            urgency=raw_data.get("urgency", 50.0),
            defect_severity=raw_data.get("defect_severity", 0.0),
            overdue_days=int(raw_data.get("overdue_days", 0)),
            failure_probability=float(raw_data.get("failure_probability", 0.05)),
            safety_impact=raw_data.get("safety_impact", 50.0),
            train_exposure=raw_data.get("train_exposure", 50.0),
            operational_impact=raw_data.get("operational_impact", 50.0),
            preferred_start=pref_start,
            preferred_end=pref_end,
            required_resources=raw_data.get("required_resources", []),
            block_type=block_type,
            status=raw_data.get("status", "PENDING_AI_EVALUATION")
        )

    @staticmethod
    def adapt_batch_payload(raw_list: List[Dict[str, Any]]) -> List[MaintenanceTaskInput]:
        """Adapts a list of raw source payloads into canonical MaintenanceTaskInput objects."""
        if not isinstance(raw_list, list):
            raise SchemaValidationException(
                message="Batch payload must be a JSON array of task objects",
                details={"received_type": type(raw_list).__name__}
            )
        if len(raw_list) == 0:
            raise SchemaValidationException(
                message="Batch payload cannot be empty",
                details={"batch_size": 0}
            )
            
        # Check for duplicate request IDs in batch
        seen_ids = set()
        for idx, item in enumerate(raw_list):
            if isinstance(item, dict) and "request_id" in item:
                req_id = str(item["request_id"])
                if req_id in seen_ids:
                    raise SchemaValidationException(
                        message=f"Duplicate request_id detected in batch payload: '{req_id}'",
                        details={"duplicate_request_id": req_id, "index": idx}
                    )
                seen_ids.add(req_id)
                
        return [Module1InputAdapter.adapt_source_payload(item) for item in raw_list]

    @staticmethod
    def _parse_datetime(val: Optional[Any]) -> Optional[datetime]:
        if not val:
            return None
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except ValueError:
                raise SchemaValidationException(
                    message=f"Invalid ISO-8601 date string format: '{val}'",
                    details={"provided_value": val}
                )
        return None
