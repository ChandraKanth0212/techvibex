from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from contracts import Asset, AssetType

from .errors import AdapterError, AdapterErrorCode
from .mappings import (
    ASSET_TYPE_MAPPING,
    AdaptedEntity,
    BaseAdapter,
    build_metadata,
    build_provenance,
    choose_explicit,
    construct_model,
    ensure_mapping,
    get_field,
    invoke_topology_resolver,
    map_enum,
    number_value,
    required_string,
)


class AssetAdapter(BaseAdapter[Asset]):
    entity_type = "Asset"
    model_type = Asset

    def _adapt(
        self,
        payload: Mapping[str, Any],
        *,
        corridor_id: str | None = None,
        section: str | None = None,
        topology_resolver: Any = None,
        asset_type_mapping: Mapping[str, str | None] | None = None,
        track_id: str | None = None,
        length_metres: float | None = None,
        electrified: bool | None = None,
        condition_score: float | None = None,
    ) -> AdaptedEntity[Asset]:
        data = ensure_mapping(payload, self.entity_type)
        asset_id = required_string(data, "id", self.entity_type, "id")
        source_asset_type = required_string(
            data,
            ("assetType", "asset_type"),
            self.entity_type,
            "assetType",
        )
        mapped_asset_type = map_enum(
            source_asset_type,
            ASSET_TYPE_MAPPING,
            AssetType,
            self.entity_type,
            "assetType",
            asset_type_mapping,
        )

        source_corridor = choose_explicit(
            data,
            ("corridorId", "corridor_id"),
            corridor_id,
            self.entity_type,
            "corridor_id",
        )
        source_section = choose_explicit(
            data,
            "section",
            section,
            self.entity_type,
            "section",
        )
        resolved = None
        if (source_corridor is None or source_section is None) and topology_resolver is not None:
            resolved = invoke_topology_resolver(data, topology_resolver, self.entity_type)
        if resolved is not None:
            if isinstance(resolved, Mapping):
                resolved_corridor = get_field(resolved, ("corridor_id", "corridorId"))
                resolved_section = get_field(resolved, "section")
            elif isinstance(resolved, (tuple, list)) and len(resolved) == 2:
                resolved_corridor, resolved_section = resolved
            else:
                raise AdapterError(
                    AdapterErrorCode.UNRESOLVED_RELATIONSHIP,
                    self.entity_type,
                    "topology",
                    "The topology resolver must return corridor_id and section values.",
                    source_value=resolved,
                )
            if source_corridor is None:
                source_corridor = resolved_corridor
            if source_section is None:
                source_section = resolved_section
        if source_corridor is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "corridor_id",
                "An explicit corridor relationship is required for the Module 3 Asset model.",
                source_value=data.get("lineSection"),
                details={"ignored_fields": ["lineSection"]},
            )
        if source_section is None:
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "section",
                "An explicit section relationship is required; lineSection is not mapped automatically.",
                source_value=data.get("lineSection"),
                details={"ignored_fields": ["lineSection"]},
            )
        if not isinstance(source_corridor, str) or not source_corridor.strip():
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "corridor_id",
                "The resolved corridor_id must be a non-empty string.",
                source_value=source_corridor,
            )
        if not isinstance(source_section, str) or not source_section.strip():
            raise AdapterError(
                AdapterErrorCode.MISSING_TOPOLOGY,
                self.entity_type,
                "section",
                "The resolved section must be a non-empty string.",
                source_value=source_section,
            )

        source_track = get_field(data, ("trackId", "track_id"))
        selected_track = choose_explicit(
            data,
            ("trackId", "track_id"),
            track_id,
            self.entity_type,
            "track_id",
        )
        if selected_track is None and source_track is not None:
            selected_track = source_track
        if selected_track is not None and not isinstance(selected_track, str):
            raise AdapterError(
                AdapterErrorCode.INVALID_TYPE,
                self.entity_type,
                "track_id",
                "track_id must be a string when supplied.",
                source_value=selected_track,
            )

        source_length = get_field(data, ("lengthMetres", "length_metres"))
        selected_length = choose_explicit(
            data,
            ("lengthMetres", "length_metres"),
            length_metres,
            self.entity_type,
            "length_metres",
        )
        if selected_length is None and source_length is not None:
            selected_length = source_length
        parsed_length = number_value(selected_length, self.entity_type, "length_metres", minimum=0) if selected_length is not None else None

        source_electrified = get_field(data, "electrified")
        if source_electrified is None and electrified is None:
            parsed_electrified = None
        else:
            selected_electrified = electrified if electrified is not None else source_electrified
            if not isinstance(selected_electrified, bool):
                raise AdapterError(
                    AdapterErrorCode.INVALID_TYPE,
                    self.entity_type,
                    "electrified",
                    "electrified must be boolean when supplied.",
                    source_value=selected_electrified,
                )
            parsed_electrified = selected_electrified

        source_condition = get_field(data, ("conditionScore", "condition_score"))
        selected_condition = choose_explicit(
            data,
            ("conditionScore", "condition_score"),
            condition_score,
            self.entity_type,
            "condition_score",
        )
        if selected_condition is None and source_condition is not None:
            selected_condition = source_condition
        parsed_condition = number_value(selected_condition, self.entity_type, "condition_score", minimum=0, maximum=1) if selected_condition is not None else None

        provenance = build_provenance(data, asset_id)
        metadata = build_metadata(
            data,
            (
                "assetCode",
                "name",
                "location",
                "status",
                "department",
                "lineSection",
                "latitude",
                "longitude",
                "sourceSystem",
                "sourceRecordId",
                "ingestedAt",
                "updatedAt",
            ),
            provenance,
        )
        values: dict[str, Any] = {
            "asset_id": asset_id,
            "asset_type": mapped_asset_type,
            "corridor_id": source_corridor,
            "section": source_section,
            "metadata": metadata,
        }
        if selected_track is not None:
            values["track_id"] = selected_track
        if parsed_length is not None:
            values["length_metres"] = parsed_length
        if parsed_electrified is not None:
            values["electrified"] = parsed_electrified
        if parsed_condition is not None:
            values["condition_score"] = parsed_condition
        model = construct_model(Asset, values, self.entity_type)
        return AdaptedEntity(model=model, metadata=metadata)


def adapt_asset(payload: Mapping[str, Any], **kwargs: Any) -> Asset:
    return AssetAdapter().adapt(payload, **kwargs)


def adapt_asset_with_metadata(
    payload: Mapping[str, Any], **kwargs: Any
) -> AdaptedEntity[Asset]:
    return AssetAdapter().adapt_with_metadata(payload, **kwargs)
