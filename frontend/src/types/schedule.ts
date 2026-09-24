/**
 * RailOpt Domain Entity: Schedule
 * Represents master block planning schedules across daily, weekly, or monthly horizons.
 */

import { IntegratedBlock } from './block';
import { Conflict } from './conflict';

export type PlanningHorizon = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
export type ScheduleStatus = 'DRAFT' | 'OPTIMIZED' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface ObjectiveSummary {
  totalBlocksScheduled: number;
  totalDurationMinutes: number;
  conflictsResolvedCount: number;
  efficiencyScore: number;
}

export interface Schedule {
  scheduleId: string;
  planningHorizon: PlanningHorizon;
  generatedAt: string; // ISO datetime string
  status: ScheduleStatus;
  blocks: IntegratedBlock[];
  conflicts: Conflict[];
  objectiveSummary: ObjectiveSummary;
}
