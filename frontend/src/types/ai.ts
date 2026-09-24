/**
 * RailOpt Domain Entity: AIRecommendation
 * Structural interface for AI predictions and optimization results received from Module 2 & 3.
 * (No AI calculations inside frontend).
 */

import { Department } from './asset';
import { ConstraintValidationResult, OperationalImpact } from './block';

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
