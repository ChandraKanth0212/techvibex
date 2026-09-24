/**
 * RailOpt Domain Entities: BlockRequest & IntegratedBlock
 * Core entities for divisional block requests and multi-department bundled Integrated Blocks.
 */

import { Department } from './asset';
import { BlockType } from './maintenance';

export type BlockRequestStatus =
  | 'PENDING'
  | 'ANALYZING'
  | 'CONFLICT'
  | 'INTEGRATION_CANDIDATE'
  | 'SCHEDULED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED';

export interface BlockRequest {
  requestId: string;
  taskId: string;
  department: Department;
  sectionId: string;
  requestedDate: string; // ISO date string (YYYY-MM-DD)
  preferredStart: string; // ISO datetime string
  preferredEnd: string; // ISO datetime string
  durationMinutes: number;
  blockType: BlockType;
  priority: number;
  status: BlockRequestStatus;
  submittedAt: string; // ISO datetime string
}

export type IntegratedBlockStatus =
  | 'AI_PROPOSED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'MODIFIED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ConstraintValidationResult {
  corridorAvailable: boolean;
  requiredDurationSatisfied: boolean;
  passengerTrainConflict: boolean;
  goodsTrainConflict: boolean;
  resourceConflict: boolean;
  locationConflict: boolean;
  dependencyConflict: boolean;
  overallFeasible: boolean;
}

export interface OperationalImpact {
  trainsAffectedCount: number;
  totalDelayMinutes: number;
  estimatedFreightThroughputImpact: string;
  safetyRiskIndex: number;
}

export type IntegratedBlockSource = 'MANUAL' | 'OPTIMIZER_GENERATED' | 'AI_RECOMMENDED';

export interface IntegratedBlock {
  blockId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  sectionId: string;
  fromStation: string;
  toStation: string;
  startTime: string; // ISO datetime string
  endTime: string; // ISO datetime string
  durationMinutes: number;
  departments: Department[];
  taskIds: string[];
  requestIds: string[];
  status: IntegratedBlockStatus;
  constraintValidation: ConstraintValidationResult;
  operationalImpact: OperationalImpact;
  source: IntegratedBlockSource;
}
