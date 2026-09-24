/**
 * RailOpt Domain Entity: Asset
 * Represents physical railway infrastructure assets (tracks, signals, OHE, etc.)
 */

export type Department = 'ENGINEERING' | 'SNT' | 'TRACTION';

export type AssetType =
  | 'TRACK'
  | 'TURNOUT'
  | 'BRIDGE'
  | 'SIGNAL'
  | 'POINT_MACHINE'
  | 'AXLE_COUNTER'
  | 'OHE'
  | 'FEEDER'
  | 'ISOLATOR'
  | 'TELECOM';

export type CriticalityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AssetCondition = 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
export type AssetStatus = 'OPERATIONAL' | 'DEGRADED' | 'MAINTENANCE_REQUIRED' | 'OUT_OF_SERVICE';

export interface Asset {
  assetId: string;
  department: Department;
  assetType: AssetType;
  sectionId: string;
  location: string;
  criticality: CriticalityLevel;
  condition: AssetCondition;
  status: AssetStatus;
  lastMaintenanceDate: string; // ISO date string (YYYY-MM-DD)
  nextMaintenanceDue: string;  // ISO date string (YYYY-MM-DD)
}
