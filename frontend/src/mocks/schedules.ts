import { Schedule } from '../types/schedule';
import { mockIntegratedBlocks } from './integratedBlocks';
import { mockConflicts } from './conflicts';

/**
 * RailOpt Synthetic Demo Data: Master Schedules
 * Division: SECUNDERABAD (SEC)
 * 
 * Master planning schedules across DAILY, WEEKLY, and MONTHLY planning horizons.
 * Embedded blocks and conflicts reference canonical items in the mock datasets.
 */
export const mockSchedules: Schedule[] = [
  // ==========================================
  // DAILY SCHEDULE (2026-09-25)
  // ==========================================
  {
    scheduleId: 'SCHED-001',
    planningHorizon: 'DAILY',
    generatedAt: '2026-09-24T10:30:00Z',
    status: 'PUBLISHED',
    blocks: mockIntegratedBlocks.filter((b) =>
      ['BLK-INT-001', 'BLK-INT-003', 'BLK-INT-008'].includes(b.blockId)
    ),
    conflicts: mockConflicts.filter((c) =>
      ['CNF-002', 'CNF-004', 'CNF-005'].includes(c.conflictId)
    ),
    objectiveSummary: {
      totalBlocksScheduled: 3,
      totalDurationMinutes: 270,
      conflictsResolvedCount: 3,
      efficiencyScore: 94.2,
    },
  },

  // ==========================================
  // WEEKLY SCHEDULE (Sept 25 - Oct 01, 2026) - Scenario 7
  // ==========================================
  {
    scheduleId: 'SCHED-002',
    planningHorizon: 'WEEKLY',
    generatedAt: '2026-09-24T11:00:00Z',
    status: 'OPTIMIZED',
    blocks: mockIntegratedBlocks.filter((b) =>
      ['BLK-INT-001', 'BLK-INT-002', 'BLK-INT-003', 'BLK-INT-005'].includes(b.blockId)
    ),
    conflicts: mockConflicts.filter((c) =>
      ['CNF-001', 'CNF-003', 'CNF-006', 'CNF-007', 'CNF-008'].includes(c.conflictId)
    ),
    objectiveSummary: {
      totalBlocksScheduled: 4,
      totalDurationMinutes: 300,
      conflictsResolvedCount: 2,
      efficiencyScore: 86.5,
    },
  },

  // ==========================================
  // MONTHLY SCHEDULE (October 2026) - Scenario 8
  // ==========================================
  {
    scheduleId: 'SCHED-003',
    planningHorizon: 'MONTHLY',
    generatedAt: '2026-09-24T12:00:00Z',
    status: 'DRAFT',
    blocks: mockIntegratedBlocks.filter((b) =>
      ['BLK-INT-006', 'BLK-INT-007'].includes(b.blockId)
    ),
    conflicts: mockConflicts.filter((c) =>
      ['CNF-009', 'CNF-010'].includes(c.conflictId)
    ),
    objectiveSummary: {
      totalBlocksScheduled: 2,
      totalDurationMinutes: 165,
      conflictsResolvedCount: 1,
      efficiencyScore: 78.0,
    },
  },
];
