import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integratedBlockService, type IntegratedBlockFilters } from '@/services/integratedBlockService';
import type { IntegratedBlockStatus } from '@/types/block';
import { DASHBOARD_KEYS } from './useDashboard';

export const INTEGRATED_BLOCK_KEYS = {
  all: ['integratedBlocks'] as const,
  lists: () => [...INTEGRATED_BLOCK_KEYS.all, 'list'] as const,
  list: (filters?: IntegratedBlockFilters) => [...INTEGRATED_BLOCK_KEYS.lists(), filters] as const,
  details: () => [...INTEGRATED_BLOCK_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...INTEGRATED_BLOCK_KEYS.details(), id] as const,
};

export function useIntegratedBlocks(filters?: IntegratedBlockFilters) {
  return useQuery({
    queryKey: INTEGRATED_BLOCK_KEYS.list(filters),
    queryFn: () => integratedBlockService.getIntegratedBlocks(filters),
  });
}

export function useIntegratedBlock(blockId: string) {
  return useQuery({
    queryKey: INTEGRATED_BLOCK_KEYS.detail(blockId),
    queryFn: () => integratedBlockService.getIntegratedBlock(blockId),
    enabled: Boolean(blockId),
  });
}

export function useApproveIntegratedBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ blockId, reason }: { blockId: string; reason?: string }) =>
      integratedBlockService.approveIntegratedBlock(blockId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INTEGRATED_BLOCK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}

export function useRejectIntegratedBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ blockId, reason }: { blockId: string; reason?: string }) =>
      integratedBlockService.rejectIntegratedBlock(blockId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INTEGRATED_BLOCK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}

export function useUpdateIntegratedBlockStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      blockId,
      status,
      reason,
    }: {
      blockId: string;
      status: IntegratedBlockStatus;
      reason?: string;
    }) => integratedBlockService.updateIntegratedBlockStatus(blockId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INTEGRATED_BLOCK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}
