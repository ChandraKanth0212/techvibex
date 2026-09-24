/**
 * RailOpt Module 4 – Dashboard Service
 */

import { mockStore } from './mockStore';
import type { DashboardMetrics } from '@/types/dashboard';
import type { Department } from '@/types/asset';

export interface DepartmentMetricSummary {
  department: Department;
  totalTasks: number;
  criticalTasks: number;
  pendingRequests: number;
  integratedBlocks: number;
}

export const dashboardService = {
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const blocks = mockStore.getIntegratedBlocks();
    const requests = mockStore.getBlockRequests();
    const conflicts = mockStore.getConflicts();
    const tasks = mockStore.getTasks();

    const activeBlocks = blocks.filter((b) =>
      ['APPROVED', 'PUBLISHED', 'UNDER_REVIEW'].includes(b.status),
    ).length;

    const pendingRequests = requests.filter((r) =>
      ['PENDING', 'ANALYZING', 'INTEGRATION_CANDIDATE'].includes(r.status),
    ).length;

    const conflictAlerts = conflicts.filter((c) =>
      ['OPEN', 'UNDER_REVIEW'].includes(c.resolutionStatus),
    ).length;

    const integratedBlocks = blocks.filter((b) => b.departments.length >= 2).length;

    const criticalTasks = tasks.filter(
      (t) => t.criticality === 'CRITICAL' && !['COMPLETED', 'CANCELLED'].includes(t.status),
    ).length;

    const overdueTasks = tasks.filter((t) => t.overdueDays > 0).length;
    const corridorUtilization = Math.min(100, Math.round((activeBlocks / 5) * 100));
    const estimatedDowntimeReduction = blocks.length > 0 ? Math.round((integratedBlocks / blocks.length) * 100) : 0;

    return {
      activeBlocks,
      pendingRequests,
      conflictAlerts,
      integratedBlocks,
      criticalTasks,
      overdueTasks,
      corridorUtilization,
      estimatedDowntimeReduction,
    };
  },

  async getDepartmentSummaries(): Promise<DepartmentMetricSummary[]> {
    const departments: Department[] = ['ENGINEERING', 'SNT', 'TRACTION'];
    const tasks = mockStore.getTasks();
    const requests = mockStore.getBlockRequests();
    const blocks = mockStore.getIntegratedBlocks();

    return departments.map((dept) => ({
      department: dept,
      totalTasks: tasks.filter((t) => t.department === dept).length,
      criticalTasks: tasks.filter(
        (t) => t.department === dept && t.criticality === 'CRITICAL' && !['COMPLETED', 'CANCELLED'].includes(t.status),
      ).length,
      pendingRequests: requests.filter(
        (r) => r.department === dept && ['PENDING', 'ANALYZING', 'INTEGRATION_CANDIDATE'].includes(r.status),
      ).length,
      integratedBlocks: blocks.filter((b) => b.departments.includes(dept)).length,
    }));
  },

  async resetDemoStore(): Promise<boolean> {
    mockStore.resetStore();
    return true;
  },
};
