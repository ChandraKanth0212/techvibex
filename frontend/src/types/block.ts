/**
 * RailOpt Domain Entities: BlockRequest & IntegratedBlock
 * Core entities for divisional block requests and multi-department bundled Integrated Blocks.
 */

import { Department } from './asset';
import { BlockType } from './maintenance';
import type { OptimizerOccupancyType } from './optimizer';

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
  corridorId?: string;
  requestedDate: string; // ISO date string (YYYY-MM-DD)
  preferredStart: string; // ISO datetime string
  preferredEnd: string; // ISO datetime string
  durationMinutes: number;
  blockType: BlockType;
  /**
   * Module 3 `BlockRequest.occupancy_type`, in Module 3's own vocabulary
   * (TRAFFIC_BLOCK | POSSESSION | SLOW_MOVEMENT).
   *
   * NOT the same as `blockType`. Module 4 `BlockType` is
   * CORRIDOR/SHADOW/EMERGENCY/ROUTINE - an operational possession class that
   * Module 3 cannot express - and Module 3 defaults `occupancy_type` to
   * TRAFFIC_BLOCK. Readiness keeps this blocking, because silently inheriting
   * TRAFFIC_BLOCK for what may be a possession request is precisely the
   * assumption worth refusing. Declared separately, never derived from
   * `blockType`.
   */
  occupancyType?: OptimizerOccupancyType;
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
  corridorId?: string;
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
