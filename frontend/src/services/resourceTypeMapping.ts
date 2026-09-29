/**
 * Phase 9B-8, Decision C — AN EXPLICIT, VERSIONED MAPPING LAYER.
 *
 * Module 4 keeps its operational resource vocabulary
 * (`TRACK_MACHINE | MAINTENANCE_CREW | SIGNAL_CREW | OHE_CREW |
 * INSPECTION_TEAM | VEHICLE`) and Module 3 keeps its own
 * (`ENGINEERING_TRAIN | MACHINERY | MANPOWER | MATERIAL | POSSESSION`).
 * The two share ZERO values, so the correspondence has to be decided rather than
 * derived. This module is that decision's only home:
 *
 *   Module4ResourceType -> approved ResourceTypeMapping -> Module3ResourceType
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * `APPROVED_RESOURCE_TYPE_MAPPINGS` is EMPTY, and that is the honest current
 * state: no correspondence has been approved, so every Module 4 resource type
 * stays unresolved. The table is the shape a decision will be recorded in; it is
 * not a place to put a decision that has not been taken.
 *
 * NO IMPLICIT COERCION, OF ANY KIND
 * --------------------------------
 *   - Not by name similarity: `TRACK_MACHINE` contains the letters of
 *     `MACHINERY`, and matching on that would be deciding that a track machine is
 *     machinery. It may be, but "may be" is the definition of unmapped.
 *   - Not by substring, prefix, length, edit distance or any other heuristic.
 *   - Not by a fallback: nothing defaults to `MANPOWER` or `MACHINERY`, and no
 *     Module 3 default is inherited.
 *   - Not by per-record hand-setting: a `Resource.module3ResourceType` that no
 *     approved mapping backs is still unmapped, and one that CONTRADICTS an
 *     approved mapping is reported as a conflict rather than silently preferred.
 *
 * The mapping is passed IN as a parameter rather than read from a module-level
 * constant inside the mapping functions. That makes the "an approved mapping can
 * be applied later" case testable without editing this file, and it is what lets
 * the tests prove the mapping is driven by the table and not by the input string.
 *
 * EVERYTHING HERE IS PURE AND DETERMINISTIC. Conflicts are reported in a stable
 * order so the same table always yields the same verdict.
 */

import {
  MODULE_4_RESOURCE_TYPES,
  type Resource,
  type ResourceType,
  type ResourceTypeMapping,
} from '@/types/resource';
import { MODULE_3_RESOURCE_TYPES, type OptimizerResourceType } from '@/types/optimizer';

export { MODULE_4_RESOURCE_TYPES, MODULE_3_RESOURCE_TYPES };

/**
 * Version of the mapping table as it stands.
 *
 * `UNAPPROVED` rather than a number, because no version exists yet: a number
 * would imply a first version had been agreed and later superseded.
 */
export const RESOURCE_TYPE_MAPPING_VERSION = 'UNAPPROVED';

/**
 * The approved correspondences. EMPTY, on purpose.
 *
 * Phase 9B-8 approved the MECHANISM and explicitly did not approve any
 * mapping. Populating this array is a railway/engineering domain decision that
 * has not been made, and inventing entries would decide a scheduling resource's
 * type by assertion.
 */
export const APPROVED_RESOURCE_TYPE_MAPPINGS: readonly ResourceTypeMapping[] = [];

export type ResourceMappingStatus = 'MAPPED' | 'UNMAPPED' | 'CONFLICT' | 'INVALID_TABLE';

export type ResourceMappingResult =
  | {
      readonly status: 'MAPPED';
      readonly module4ResourceType: ResourceType;
      readonly module3ResourceType: OptimizerResourceType;
      readonly mappingVersion: string;
      readonly approval: ResourceTypeMapping['approval'];
    }
  | {
      readonly status: 'UNMAPPED';
      readonly module4ResourceType: ResourceType;
      readonly reason: string;
    }
  | { readonly status: 'CONFLICT'; readonly reason: string }
  | { readonly status: 'INVALID_TABLE'; readonly reason: string };

/** Whether a value is one of Module 4's own resource types. */
export function isModule4ResourceType(value: unknown): value is ResourceType {
  return (
    typeof value === 'string' &&
    (MODULE_4_RESOURCE_TYPES as readonly string[]).includes(value)
  );
}

/** Whether a value is one of Module 3's own resource types. */
export function isModule3ResourceType(value: unknown): value is OptimizerResourceType {
  return (
    typeof value === 'string' &&
    (MODULE_3_RESOURCE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Checks the table itself before it is trusted.
 *
 * A table that is malformed is a different failure from a table that simply
 * lacks an entry, and reporting them together would let a typo masquerade as an
 * undecided mapping. Both a source and a target outside their own vocabulary,
 * and a missing approval, make the table unusable rather than partially usable.
 */
function validateTable(
  mappings: readonly ResourceTypeMapping[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const seen = new Map<ResourceType, string>();

  for (const mapping of mappings) {
    if (!isModule4ResourceType(mapping.module4ResourceType)) {
      return {
        ok: false,
        reason: `Mapping source ${JSON.stringify(mapping.module4ResourceType)} is not a Module 4 ResourceType.`,
      };
    }
    if (!isModule3ResourceType(mapping.module3ResourceType)) {
      return {
        ok: false,
        reason: `Mapping target ${JSON.stringify(mapping.module3ResourceType)} is not a Module 3 OptimizerResourceType.`,
      };
    }
    if (
      mapping.approval === undefined ||
      typeof mapping.approval.approvedBy !== 'string' ||
      mapping.approval.approvedBy.trim().length === 0 ||
      typeof mapping.approval.reference !== 'string' ||
      mapping.approval.reference.trim().length === 0
    ) {
      return {
        ok: false,
        reason: `Mapping ${mapping.module4ResourceType} -> ${mapping.module3ResourceType} carries no complete approval, so it is a proposal rather than a decision.`,
      };
    }
    if (typeof mapping.mappingVersion !== 'string' || mapping.mappingVersion.trim().length === 0) {
      return {
        ok: false,
        reason: `Mapping ${mapping.module4ResourceType} -> ${mapping.module3ResourceType} has no mappingVersion, so it cannot be attributed to a decision.`,
      };
    }

    const previous = seen.get(mapping.module4ResourceType);
    if (previous !== undefined) {
      return {
        ok: false,
        reason: `Module 4 resource type ${mapping.module4ResourceType} is mapped twice (${previous} and ${mapping.module3ResourceType}). A many-to-one table is not the model: one source type, one decided target.`,
      };
    }
    seen.set(mapping.module4ResourceType, mapping.module3ResourceType);
  }

  return { ok: true };
}

/**
 * Translates one Module 4 resource type using only an approved mapping.
 *
 * Every non-success outcome is a refusal with a stated reason. There is no
 * branch in this function that inspects the string, compares it against another
 * string, or returns a value the table did not supply.
 */
export function mapResourceType(
  module4ResourceType: ResourceType,
  mappings: readonly ResourceTypeMapping[] = APPROVED_RESOURCE_TYPE_MAPPINGS,
): ResourceMappingResult {
  const table = validateTable(mappings);
  if (!table.ok) {
    return { status: 'INVALID_TABLE', reason: table.reason };
  }

  if (!isModule4ResourceType(module4ResourceType)) {
    return {
      status: 'UNMAPPED',
      module4ResourceType,
      reason: `${JSON.stringify(module4ResourceType)} is not a Module 4 ResourceType (${MODULE_4_RESOURCE_TYPES.join(' | ')}). An unknown source type cannot be mapped by resemblance to a Module 3 value.`,
    };
  }

  const approved = mappings.find((m) => m.module4ResourceType === module4ResourceType);
  if (approved === undefined) {
    return {
      status: 'UNMAPPED',
      module4ResourceType,
      reason: `No approved mapping from ${module4ResourceType} to a Module 3 resource type. The two vocabularies share zero values, so the correspondence must be decided; it is never inferred from the name, and nothing falls back to MANPOWER or MACHINERY.`,
    };
  }

  return {
    status: 'MAPPED',
    module4ResourceType,
    module3ResourceType: approved.module3ResourceType,
    mappingVersion: approved.mappingVersion,
    approval: approved.approval,
  };
}

/**
 * Resolves the Module 3 resource type for one `Resource`.
 *
 * The approved mapping is the authority. `Resource.module3ResourceType` is
 * CROSS-CHECKED against it, never preferred to it:
 *   - agree                  -> MAPPED
 *   - no mapping, no value   -> UNMAPPED
 *   - no mapping, value set  -> UNMAPPED. A hand-set value with no approved
 *     mapping behind it is an unapproved assertion, and honouring it would let
 *     the table be bypassed record by record.
 *   - disagree               -> CONFLICT. Reported, not resolved: a per-record
 *     value that contradicts an approved table needs a human to settle.
 */
export function resolveResourceModule3Type(
  resource: Pick<Resource, 'resourceId' | 'resourceType' | 'module3ResourceType'>,
  mappings: readonly ResourceTypeMapping[] = APPROVED_RESOURCE_TYPE_MAPPINGS,
): ResourceMappingResult {
  const mapped = mapResourceType(resource.resourceType, mappings);

  if (mapped.status === 'INVALID_TABLE') return mapped;

  if (mapped.status === 'MAPPED') {
    if (
      resource.module3ResourceType !== undefined &&
      resource.module3ResourceType !== mapped.module3ResourceType
    ) {
      return {
        status: 'CONFLICT',
        reason: `Resource ${resource.resourceId} records module3ResourceType ${resource.module3ResourceType}, but the approved mapping (${mapped.mappingVersion}) for ${resource.resourceType} is ${mapped.module3ResourceType}. The record is not silently overridden.`,
      };
    }
    return mapped;
  }

  if (resource.module3ResourceType !== undefined) {
    return {
      status: 'UNMAPPED',
      module4ResourceType: resource.resourceType,
      reason: `Resource ${resource.resourceId} records module3ResourceType ${resource.module3ResourceType}, but no approved mapping supports it. A value set on the record does not substitute for an approved mapping table, so the type stays unresolved.`,
    };
  }

  return mapped;
}
