import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceService, type MaintenanceFilters } from '@/services/maintenanceService';
import type { TaskStatus } from '@/types/maintenance';
import { DASHBOARD_KEYS } from './useDashboard';

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
