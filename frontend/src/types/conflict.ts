/**
 * RailOpt Domain Entity: Conflict
 * Represents time, location, train pathing, or resource conflicts detected across maintenance blocks.
 */

import { CriticalityLevel } from './asset';

export type ConflictType =
  | 'TIME'
  | 'LOCATION'
  | 'TRAIN'
  | 'GOODS'
  | 'RESOURCE'
  | 'CORRIDOR'
  | 'DURATION'
  | 'DEPENDENCY';

export type ConflictSeverity = CriticalityLevel; // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type ConflictResolutionStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'IGNORED';

export interface Conflict {
  conflictId: string;
  type: ConflictType;
  severity: ConflictSeverity;
  affectedTaskIds: string[];
  affectedBlockIds: string[];
  sectionId: string;
  description: string;
  detectedAt: string; // ISO datetime string
  resolutionStatus: ConflictResolutionStatus;
  suggestedAction?: string;
}
