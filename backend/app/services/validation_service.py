import os
import json
from typing import Dict, Any, List, Optional, Tuple
import jsonschema
from fastapi import HTTPException, status

CONTRACTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../contracts"))


class DataValidationService:
    def __init__(self, contracts_dir: str = CONTRACTS_DIR):
        self.contracts_dir = contracts_dir
        self.schemas: Dict[str, Dict[str, Any]] = {}
        self._load_schemas()

    def _load_schemas(self):
        if os.path.exists(self.contracts_dir):
            for file_name in os.listdir(self.contracts_dir):
                if file_name.endswith(".schema.json"):
                    schema_path = os.path.join(self.contracts_dir, file_name)
                    try:
                        with open(schema_path, "r", encoding="utf-8") as f:
                            schema_data = json.load(f)
                            entity_name = file_name.replace(".schema.json", "")
                            self.schemas[entity_name] = schema_data
                    except Exception:
                        pass

    def validate_payload(self, entity_type: str, payload: Dict[str, Any], server_generated_required: Optional[List[str]] = None) -> Tuple[bool, str]:
        schema = self.schemas.get(entity_type)
        if not schema:
            return True, ""  # If schema file not found, fall back to Pydantic validation

        # Server-generated fields (e.g. id) are not required from the client at
        # create time but remain required in the canonical (read/output) schema.
        if server_generated_required:
            schema = {**schema, "required": [f for f in schema.get("required", []) if f not in server_generated_required]}

        try:
            jsonschema.validate(instance=payload, schema=schema)
            return True, ""
        except jsonschema.ValidationError as err:
            return False, f"JSON Schema Validation Error for {entity_type}: {err.message}"
        except Exception as ex:
            return False, f"Validation exception: {str(ex)}"


validation_service = DataValidationService()
