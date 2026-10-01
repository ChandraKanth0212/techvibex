import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceService, type MaintenanceFilters } from '@/services/maintenanceService';
import type { PriorityConfirmationActor, TaskStatus } from '@/types/maintenance';
import type { OptimizerPriorityLevel } from '@/types/optimizer';
import { DASHBOARD_KEYS } from './useDashboard';
import { AUDIT_KEYS } from './useAudit';

export const MAINTENANCE_KEYS = {
  all: ['maintenance'] as const,
  lists: () => [...MAINTENANCE_KEYS.all, 'list'] as const,
  list: (filters?: MaintenanceFilters) => [...MAINTENANCE_KEYS.lists(), filters] as const,
  details: () => [...MAINTENANCE_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...MAINTENANCE_KEYS.details(), id] as const,
};

export function useMaintenanceTasks(filters?: MaintenanceFilters) {
  return useQuery({
    queryKey: MAINTENANCE_KEYS.list(filters),
    queryFn: () => maintenanceService.getMaintenanceTasks(filters),
  });
}

export function useMaintenanceTask(taskId: string) {
  return useQuery({
    queryKey: MAINTENANCE_KEYS.detail(taskId),
    queryFn: () => maintenanceService.getMaintenanceTask(taskId),
    enabled: Boolean(taskId),
  });
}

export function useDeferMaintenanceTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason?: string }) =>
      maintenanceService.deferMaintenanceTask(taskId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MAINTENANCE_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, status, reason }: { taskId: string; status: TaskStatus; reason?: string }) =>
      maintenanceService.updateTaskStatus(taskId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MAINTENANCE_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}

/**
 * The variables a priority confirmation needs. `actor` is required and never
 * defaulted: the mutation exists to record a named person making a decision.
 */
export interface ConfirmTaskPriorityVariables {
  taskId: string;
  /** The level the human explicitly selected. */
  priority: OptimizerPriorityLevel;
  actor: PriorityConfirmationActor;
  context?: {
    readonly recommendationId?: string;
    readonly confirmedAt?: string;
    readonly reason?: string;
  };
}

/**
 * Records a human-confirmed Module 3 priority.
 *
 * A refusal is a resolved mutation carrying `ok: false`, not an error: nothing was
 * written, so nothing is invalidated. Invalidating on a refusal would refetch every
 * task to re-render a page that provably did not change.
 */
export function useConfirmTaskPriority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, priority, actor, context }: ConfirmTaskPriorityVariables) =>
      maintenanceService.confirmTaskPriority(taskId, priority, actor, context),
    onSuccess: (result) => {
      if (!result.ok) return;
      queryClient.invalidateQueries({ queryKey: MAINTENANCE_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
      // The confirmation writes an audit event, so the audit log is now stale too.
      queryClient.invalidateQueries({ queryKey: AUDIT_KEYS.all });
    },
  });
}
