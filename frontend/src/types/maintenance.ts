/**
 * RailOpt Domain Entity: MaintenanceTask
 * Represents maintenance work orders requested across railway engineering departments.
 */

import { Department, CriticalityLevel } from './asset';
import { FailureRiskLevel } from './defect';

export type TaskStatus =
  | 'PENDING'
  | 'PRIORITIZED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DEFERRED'
  | 'CANCELLED';

export type BlockType = 'CORRIDOR' | 'SHADOW' | 'EMERGENCY' | 'ROUTINE';
export type UrgencyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MaintenanceTask {
  taskId: string;
  assetId: string;
  department: Department;
  workType: string;
  sectionId: string;
  location: string;
  requestedDate: string; // ISO date string (YYYY-MM-DD)
  preferredStart: string; // ISO datetime string (YYYY-MM-DDTHH:mm:ssZ)
  preferredEnd: string; // ISO datetime string (YYYY-MM-DDTHH:mm:ssZ)
  durationMinutes: number;
  criticality: CriticalityLevel;
  urgency: UrgencyLevel;
  overdueDays: number;
  riskLevel: FailureRiskLevel;
  blockType: BlockType;
  requiredResources: string[];
  status: TaskStatus;
  defectId?: string;
}
