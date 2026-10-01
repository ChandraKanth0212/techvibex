/**
 * RailOpt Module 4 – Maintenance Service
 */

import { mockRepository } from './mockRepository';
import { mockStore } from './mockStore';
import type {
  MaintenanceTask,
  PriorityConfirmationActor,
  TaskStatus,
} from '@/types/maintenance';
import type { OptimizerPriorityLevel } from '@/types/optimizer';
import type { TaskPriorityConfirmationResult } from './mockStore';
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

  async updateTaskStatus(taskId: string, status: TaskStatus, reason?: string): Promise<boolean> {
    return mockStore.updateTaskStatus(taskId, status, 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async getAssets() {
    return mockRepository.getAssets();
  },

  async getResources() {
    return mockRepository.getResources();
  },

  /**
   * Records a human's explicit Module 3 priority decision on a task.
   *
   * Unlike {@link maintenanceService.deferMaintenanceTask} and
   * {@link maintenanceService.updateTaskStatus} — which act as `'DEMO_USER'` /
   * `'PLANNING_OFFICER'` because a prototype status flip needs no owner — this
   * takes the actor from the caller with NO default. A confirmation is a
   * scheduling commitment, and the person who made it has to be on record by
   * name; defaulting the actor here would record an unowned decision as though
   * it had an owner.
   *
   * `priority` is the level the human selected. It is never taken from an AI
   * recommendation, and `recommendationId` only records which advice the decision
   * settled. Validation, refusal and persistence all happen in the store via the
   * approved `confirmTaskPriority` authority; this method adds no rules of its own.
   */
  async confirmTaskPriority(
    taskId: string,
    priority: OptimizerPriorityLevel,
    actor: PriorityConfirmationActor,
    context?: {
      readonly recommendationId?: string;
      readonly confirmedAt?: string;
      readonly reason?: string;
    },
  ): Promise<TaskPriorityConfirmationResult> {
    return mockStore.confirmTaskPriority(taskId, priority, actor, context);
  },
};
