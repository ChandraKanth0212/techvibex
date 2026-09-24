import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockRequestService, type BlockRequestFilters } from '@/services/blockRequestService';
import type { BlockRequestStatus } from '@/types/block';
import { DASHBOARD_KEYS } from './useDashboard';

export const BLOCK_REQUEST_KEYS = {
  all: ['blockRequests'] as const,
  lists: () => [...BLOCK_REQUEST_KEYS.all, 'list'] as const,
  list: (filters?: BlockRequestFilters) => [...BLOCK_REQUEST_KEYS.lists(), filters] as const,
  details: () => [...BLOCK_REQUEST_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...BLOCK_REQUEST_KEYS.details(), id] as const,
};

export function useBlockRequests(filters?: BlockRequestFilters) {
  return useQuery({
    queryKey: BLOCK_REQUEST_KEYS.list(filters),
    queryFn: () => blockRequestService.getBlockRequests(filters),
  });
}

export function useBlockRequest(requestId: string) {
  return useQuery({
    queryKey: BLOCK_REQUEST_KEYS.detail(requestId),
    queryFn: () => blockRequestService.getBlockRequest(requestId),
    enabled: Boolean(requestId),
  });
}

export function useApproveBlockRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      blockRequestService.approveBlockRequest(requestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLOCK_REQUEST_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}

export function useRejectBlockRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      blockRequestService.rejectBlockRequest(requestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLOCK_REQUEST_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}

export function useUpdateBlockRequestStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      status,
      reason,
    }: {
      requestId: string;
      status: BlockRequestStatus;
      reason?: string;
    }) => blockRequestService.updateBlockRequestStatus(requestId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLOCK_REQUEST_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}
