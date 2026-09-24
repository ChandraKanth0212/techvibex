/**
 * RailOpt Module 4 – Conflict Service
 */

import { mockStore } from './mockStore';
import type { Conflict, ConflictType, ConflictSeverity, ConflictResolutionStatus } from '@/types/conflict';
import type { Department } from '@/types/asset';

export interface ConflictFilters {
  type?: ConflictType;
  severity?: ConflictSeverity;
  resolutionStatus?: ConflictResolutionStatus;
  sectionId?: string;
  department?: Department;
}

export const conflictService = {
  async getConflicts(filters?: ConflictFilters): Promise<Conflict[]> {
    const conflicts = mockStore.getConflicts();
    if (!filters) return conflicts;

    return conflicts.filter((c) => {
      if (filters.type && c.type !== filters.type) return false;
      if (filters.severity && c.severity !== filters.severity) return false;
      if (filters.resolutionStatus && c.resolutionStatus !== filters.resolutionStatus) return false;
      if (filters.sectionId && c.sectionId !== filters.sectionId) return false;
      return true;
    });
  },

  async getConflict(conflictId: string): Promise<Conflict | undefined> {
    return mockStore.getConflicts().find((c) => c.conflictId === conflictId);
  },

  async resolveConflict(conflictId: string, reason?: string): Promise<boolean> {
    return mockStore.updateConflictStatus(conflictId, 'RESOLVED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async markConflictUnderReview(conflictId: string): Promise<boolean> {
    return mockStore.updateConflictStatus(conflictId, 'UNDER_REVIEW', 'DEMO_USER', 'PLANNING_OFFICER');
  },

  async ignoreConflict(conflictId: string, reason?: string): Promise<boolean> {
    return mockStore.updateConflictStatus(conflictId, 'IGNORED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },
};
