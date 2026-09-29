/**
 * RailOpt Domain Entity: Resource
 * Represents maintenance crews, track machines, OHE/S&T teams, and specialized vehicles.
 */

import { Department } from './asset';
import type { OptimizerResourceType } from './optimizer';

export type ResourceType =
  | 'TRACK_MACHINE'
  | 'MAINTENANCE_CREW'
  | 'SIGNAL_CREW'
  | 'OHE_CREW'
  | 'INSPECTION_TEAM'
  | 'VEHICLE';

/**
 * Module 4 `ResourceType` as a runtime tuple.
 *
 * Zero overlap with Module 3's `OptimizerResourceType`, which is the whole
 * reason Decision C needs an explicit mapping layer. Single source: readiness
 * and the mapping layer both read this rather than keeping copies that could
 * drift.
 */
export const MODULE_4_RESOURCE_TYPES = [
  'TRACK_MACHINE',
  'MAINTENANCE_CREW',
  'SIGNAL_CREW',
  'OHE_CREW',
  'INSPECTION_TEAM',
  'VEHICLE',
] as const satisfies readonly ResourceType[];

export type ResourceStatus = 'AVAILABLE' | 'ALLOCATED' | 'MAINTENANCE' | 'OFF_DUTY';

export interface ResourceAvailabilityWindow {
  windowId: string;
  start: string; // ISO datetime string
  end: string;   // ISO datetime string
  isAvailable: boolean;
}

export interface Resource {
  resourceId: string;
  department: Department;
  resourceType: ResourceType;
  /**
   * The Module 3 `ResourceType` this resource corresponds to, recorded
   * explicitly.
   *
   * The two vocabularies share NO value:
   *   Module 4: TRACK_MACHINE | MAINTENANCE_CREW | SIGNAL_CREW | OHE_CREW |
   *             INSPECTION_TEAM | VEHICLE
   *   Module 3: ENGINEERING_TRAIN | MACHINERY | MANPOWER | MATERIAL | POSSESSION
   * so `resourceType` is left untouched and never coerced. This field exists so
   * that an agreed correspondence can be recorded once, by a product decision,
   * instead of being guessed per request. Absent means no correspondence has
   * been decided, not "infer it from resourceType".
   */
  module3ResourceType?: OptimizerResourceType;
  name: string;
  availabilityWindows: ResourceAvailabilityWindow[];
  currentLocation: string;
  status: ResourceStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9B-8, Decision C: an explicit, versioned mapping layer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who approved a resource-type correspondence, and when.
 *
 * A mapping without this is not a mapping; it is a guess with a table around it.
 * `reference` is the decision record (ticket, minute, approval note) so the
 * mapping can be audited or withdrawn later.
 */
export interface ResourceTypeMappingApproval {
  readonly approvedBy: string;
  /** ISO datetime string. */
  readonly approvedAt: string;
  readonly reference: string;
}

/**
 * ONE approved correspondence, in the version of the table that approved it.
 *
 * The Module 4 vocabulary is kept as-is and the Module 3 vocabulary is reached
 * only through an entry here. Nothing coerces between the two enums: the two
 * share zero values, and no amount of string similarity decides a scheduling
 * resource's type. `mappingVersion` is part of the entry rather than a property
 * of the table, so a record of what was decided cannot be separated from which
 * decision it belonged to.
 */
export interface ResourceTypeMapping {
  readonly module4ResourceType: ResourceType;
  readonly module3ResourceType: OptimizerResourceType;
  readonly mappingVersion: string;
  readonly approval: ResourceTypeMappingApproval;
}
