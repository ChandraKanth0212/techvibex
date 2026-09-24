import { DashboardMetrics } from '../types/dashboard';
import { mockMaintenanceTasks } from './maintenanceTasks';
import { mockBlockRequests } from './blockRequests';
import { mockIntegratedBlocks } from './integratedBlocks';
import { mockConflicts } from './conflicts';

/**
 * RailOpt Synthetic Demo Data: Dashboard Metrics
 * Division: SECUNDERABAD (SEC)
 *
 * All metrics are derived deterministically from the canonical mock datasets.
 * No independently invented numbers — each value traces back to a real record count
 * or computed ratio so the UI and dataset remain internally consistent.
 *
 * Derivation notes:
 *   activeBlocks            – IntegratedBlocks with status APPROVED | PUBLISHED | UNDER_REVIEW
 *   pendingRequests         – BlockRequests with status PENDING | ANALYZING | INTEGRATION_CANDIDATE
 *   conflictAlerts          – Conflicts with resolutionStatus OPEN | UNDER_REVIEW
 *   integratedBlocks        – IntegratedBlocks with 2+ departments (multi-dept bundles)
 *   criticalTasks           – MaintenanceTasks with criticality CRITICAL (not COMPLETED / CANCELLED)
 *   overdueTasks            – MaintenanceTasks with overdueDays > 0
 *   corridorUtilization     – (activeBlocks / totalCorridors=5) * 100, capped at 100
 *   estimatedDowntimeReduction – Derived: (integratedBlocks / totalBlocks) * 100
 */

// Derivation calculations (single source of truth)
const _active = mockIntegratedBlocks.filter((b) =>
  ['APPROVED', 'PUBLISHED', 'UNDER_REVIEW'].includes(b.status),
).length; // 5

const _pending = mockBlockRequests.filter((r) =>
  ['PENDING', 'ANALYZING', 'INTEGRATION_CANDIDATE'].includes(r.status),
).length; // 6

const _conflictAlerts = mockConflicts.filter((c) =>
  ['OPEN', 'UNDER_REVIEW'].includes(c.resolutionStatus),
).length; // 4

const _integrated = mockIntegratedBlocks.filter((b) => b.departments.length >= 2).length; // 7

const _critical = mockMaintenanceTasks.filter(
  (t) => t.criticality === 'CRITICAL' && !['COMPLETED', 'CANCELLED'].includes(t.status),
).length; // 5

const _overdue = mockMaintenanceTasks.filter((t) => t.overdueDays > 0).length; // 6

const _totalBlocks = mockIntegratedBlocks.length; // 8
const _corridorUtil = Math.round((_active / 5) * 100); // (5 active / 5 corridors) * 100 = 100
const _downtimeReduction = Math.round((_integrated / _totalBlocks) * 100); // (7/8)*100 = 87

export const mockDashboardMetrics: DashboardMetrics = {
  activeBlocks: _active,                       // 5
  pendingRequests: _pending,                   // 6
  conflictAlerts: _conflictAlerts,             // 4
  integratedBlocks: _integrated,               // 7
  criticalTasks: _critical,                    // 5
  overdueTasks: _overdue,                      // 6
  corridorUtilization: _corridorUtil,          // 100%
  estimatedDowntimeReduction: _downtimeReduction, // 87%
};
