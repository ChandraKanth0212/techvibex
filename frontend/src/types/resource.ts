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
