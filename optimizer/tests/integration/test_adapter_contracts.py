import pytest
from pydantic import BaseModel

from app.integration import (
    AdapterError,
    AdapterErrorCode,
    AdaptedEntity,
    AssetAdapter,
    MaintenanceTaskAdapter,
)
from app.integration.mappings import (
    ASSET_TYPE_MAPPING,
    PRIORITY_MAPPING,
    RESOURCE_TYPE_MAPPING,
)


class SourceShape(BaseModel):
    id: str


def test_adapter_error_is_structured_and_serializable():
    error = AdapterError(
        code=AdapterErrorCode.INVALID_ENUM,
        entity_type="Asset",
        field="assetType",
        message="bad enum",
        source_value="SIGNAL",
        details={"allowed": ["TRACK"]},
    )

    assert error.to_dict() == {
        "code": "INVALID_ENUM",
        "entity_type": "Asset",
        "field": "assetType",
        "message": "bad enum",
        "source_value": "SIGNAL",
        "details": {"allowed": ["TRACK"]},
    }
    assert str(error) == "bad enum"


def test_adapted_entity_exposes_model_and_provenance_envelope():
    source = {
        "id": "task-1",
        "assetId": "asset-1",
        "corridorId": "corridor-1",
        "estimatedDurationMinutes": 30,
        "priority": "MEDIUM",
        "workType": "INSPECTION",
        "sourceSystem": "DATA_INGESTION",
        "sourceRecordId": "source-1",
        "contractVersion": "1",
    }

    result = MaintenanceTaskAdapter().adapt_with_metadata(source)

    assert isinstance(result, AdaptedEntity)
    assert result.entity is result.model
    assert result.value is result.model
    assert result.model.task_id == "task-1"
    assert result.provenance["contract_version"] == "1"


def test_explicit_mapping_dictionaries_do_not_contain_forbidden_defaults():
    assert PRIORITY_MAPPING["CRITICAL"] is None
    assert ASSET_TYPE_MAPPING["SIGNAL"] is None
    assert RESOURCE_TYPE_MAPPING["EQUIPMENT"] is None


def test_adapter_rejects_non_mapping_source():
    with pytest.raises(AdapterError) as exc_info:
        AssetAdapter().adapt(SourceShape(id="asset-1"))

    assert exc_info.value.code == AdapterErrorCode.INVALID_TYPE
    assert exc_info.value.entity_type == "Asset"
