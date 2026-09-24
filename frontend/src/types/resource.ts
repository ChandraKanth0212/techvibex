/**
 * RailOpt Domain Entity: Resource
 * Represents maintenance crews, track machines, OHE/S&T teams, and specialized vehicles.
 */

import { Department } from './asset';

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
  name: string;
  availabilityWindows: ResourceAvailabilityWindow[];
  currentLocation: string;
  status: ResourceStatus;
}
