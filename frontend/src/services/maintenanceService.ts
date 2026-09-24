/**
 * RailOpt Module 4 – Maintenance Service
 */

import { mockRepository } from './mockRepository';
import { mockStore } from './mockStore';
import type { MaintenanceTask, TaskStatus } from '@/types/maintenance';
import type { Department } from '@/types/asset';
import type { CriticalityLevel } from '@/types/asset';

export interface MaintenanceFilters {
  department?: Department;
  sectionId?: string;
  status?: TaskStatus;
  criticality?: CriticalityLevel;
  overdueOnly?: boolean;
}

export const maintenanceService = {
  async getMaintenanceTasks(filters?: MaintenanceFilters): Promise<MaintenanceTask[]> {
    // Use mutable store data (supports prototype mutations)
    const tasks = mockStore.getTasks();
    if (!filters) return tasks;

    return tasks.filter((t) => {
      if (filters.department && t.department !== filters.department) return false;
      if (filters.sectionId && t.sectionId !== filters.sectionId) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.criticality && t.criticality !== filters.criticality) return false;
      if (filters.overdueOnly && t.overdueDays <= 0) return false;
      return true;
    });
  },

  async getMaintenanceTask(taskId: string): Promise<MaintenanceTask | undefined> {
    const tasks = mockStore.getTasks();
    return tasks.find((t) => t.taskId === taskId);
  },

  async deferMaintenanceTask(taskId: string, reason?: string): Promise<boolean> {
    return mockStore.updateTaskStatus(taskId, 'DEFERRED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async getAssets() {
    return mockRepository.getAssets();
  },

  async getResources() {
    return mockRepository.getResources();
  },
};
