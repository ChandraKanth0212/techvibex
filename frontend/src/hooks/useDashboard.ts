import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboardService';

export const DASHBOARD_KEYS = {
  all: ['dashboard'] as const,
  metrics: () => [...DASHBOARD_KEYS.all, 'metrics'] as const,
  departments: () => [...DASHBOARD_KEYS.all, 'departments'] as const,
};

export function useDashboardMetrics() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.metrics(),
    queryFn: () => dashboardService.getDashboardMetrics(),
  });
}

export function useDepartmentSummaries() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.departments(),
    queryFn: () => dashboardService.getDepartmentSummaries(),
  });
}

export function useResetDemo() {
  return () => dashboardService.resetDemoStore();
}
