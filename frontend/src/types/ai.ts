/**
 * RailOpt Domain Entity: AIRecommendation
 * Structural interface for AI predictions and optimization results received from Module 2 & 3.
 * (No AI calculations inside frontend).
 */

import { Department } from './asset';
import { ConstraintValidationResult, OperationalImpact } from './block';
import type { OptimizerPriorityLevel } from './optimizer';

export type RecommendationType =
  | 'INTEGRATED_BLOCK'
  | 'RESCHEDULE'
  | 'PRIORITIZE'
  | 'CONFLICT_RESOLUTION'
  | 'DEFER'
  | 'EMERGENCY_ACTION';

export type RecommendationStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'OVERRIDDEN';

export interface ProposedWindow {
  startTime: string; // ISO datetime string
  endTime: string;   // ISO datetime string
  durationMinutes: number;
}

export interface AIRecommendation {
  recommendationId: string;
  /**
   * Single task this recommendation concerns, matching Module 3
   * `PriorityResult.task_id`.
   *
   * Distinct from `affectedTaskIds`, which is a list and is what most
   * recommendations actually carry. A one-element `affectedTaskIds` is not
   * treated as a `taskId`: collapsing a list into a scalar would assert that the
   * recommendation concerns exactly one task, which the list form does not say.
   */
  taskId?: string;
  /** Module 3 `PriorityResult.priority_score`: a number on its own scale. */
  priorityScore?: number;
  /** Module 3 `PriorityResult.recommended_priority` (LOW | MEDIUM | HIGH | URGENT). */
  recommendedPriority?: OptimizerPriorityLevel;
  type: RecommendationType;
  status: RecommendationStatus;
  affectedTaskIds: string[];
  affectedBlockIds: string[];
  proposedWindow: ProposedWindow;
  departments: Department[];
  reasons: string[];
  constraintResults: ConstraintValidationResult;
  operationalImpact: OperationalImpact;
  createdAt: string; // ISO datetime string
}
