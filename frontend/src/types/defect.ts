/**
 * RailOpt Domain Entity: Defect
 * Represents infrastructure defects and safety vulnerabilities detected on assets.
 */

import { Department } from './asset';

export type DefectSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type FailureRiskLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
export type DefectStatus = 'OPEN' | 'UNDER_INVESTIGATION' | 'SCHEDULED' | 'RESOLVED' | 'CLOSED';

export interface Defect {
  defectId: string;
  assetId: string;
  department: Department;
  description: string;
  severity: DefectSeverity;
  detectedDate: string; // ISO datetime string (e.g. 2026-09-24T02:30:00Z)
  safetyImpact: string;
  failureRisk: FailureRiskLevel;
  status: DefectStatus;
}
