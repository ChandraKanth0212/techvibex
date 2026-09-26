/**
 * RailOpt Domain Entity: MaintenanceTask
 * Represents maintenance work orders requested across railway engineering departments.
 */

import { Department, CriticalityLevel } from './asset';
import { FailureRiskLevel } from './defect';
import type { OptimizerPriorityLevel, OptimizerWorkType } from './optimizer';

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
  corridorId?: string;
  location: string;
  requestedDate: string; // ISO date string (YYYY-MM-DD)
  preferredStart: string; // ISO datetime string (YYYY-MM-DDTHH:mm:ssZ)
  preferredEnd: string; // ISO datetime string (YYYY-MM-DDTHH:mm:ssZ)
  durationMinutes: number;
  criticality: CriticalityLevel;
  urgency: UrgencyLevel;
  overdueDays: number;
  riskLevel: FailureRiskLevel;
  /**
   * Module 3 `MaintenanceTask.priority`, in Module 3's own vocabulary
   * (LOW | MEDIUM | HIGH | URGENT).
   *
   * This is a SEPARATE axis from `criticality`, `urgency` and `riskLevel`, and
   * it is never computed from them. Module 4 has `criticality: 'CRITICAL'`, which
   * Module 3 cannot express, and Module 3 has `URGENT`, which Module 4 cannot
   * express; any conversion in either direction would invent a scheduling
   * commitment. A task without this field has no Module 3 priority, and stays
   * without one until a person sets it.
   */
  priority?: OptimizerPriorityLevel;
  /**
   * Module 3 `MaintenanceTask.work_type`, in Module 3's own vocabulary
   * (PREVENTIVE | CORRECTIVE | INSPECTION | REPAIR | REPLACEMENT | UPGRADE).
   *
   * Module 3 declares `work_type` with NO default, so a task without it cannot
   * be sent. `workType` above is a free-text Module 4 field whose values are not
   * this vocabulary, and deriving one from the other would invent a maintenance
   * commitment. This field stays unset until a person states it.
   */
  module3WorkType?: OptimizerWorkType;
  /**
   * Module 3 `MaintenanceTask.due_by` (a date), declared with NO default.
   *
   * NOT the same as `requestedDate`. `requestedDate` is when the work was asked
   * for; `due_by` is the deadline Module 3 schedules against. Treating one as
   * the other would silently move a deadline, so they stay separate and this
   * field stays unset until a person states it.
   */
  dueBy?: string;
  blockType: BlockType;
  requiredResources: string[];
  status: TaskStatus;
  defectId?: string;
}
