import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conflictService, type ConflictFilters } from '@/services/conflictService';
import { DASHBOARD_KEYS } from './useDashboard';

export const CONFLICT_KEYS = {
  all: ['conflicts'] as const,
  lists: () => [...CONFLICT_KEYS.all, 'list'] as const,
  list: (filters?: ConflictFilters) => [...CONFLICT_KEYS.lists(), filters] as const,
  detail: (id: string) => [...CONFLICT_KEYS.all, 'detail', id] as const,
};

export function useConflicts(filters?: ConflictFilters) {
  return useQuery({
    queryKey: CONFLICT_KEYS.list(filters),
    queryFn: () => conflictService.getConflicts(filters),
  });
}

export function useResolveConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conflictId, reason }: { conflictId: string; reason?: string }) =>
      conflictService.resolveConflict(conflictId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFLICT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}

export function useMarkConflictUnderReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conflictId }: { conflictId: string }) =>
      conflictService.markConflictUnderReview(conflictId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFLICT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}

export function useIgnoreConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conflictId, reason }: { conflictId: string; reason?: string }) =>
      conflictService.ignoreConflict(conflictId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFLICT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}
