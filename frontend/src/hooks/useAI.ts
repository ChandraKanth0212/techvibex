import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiService, type AIRecommendationFilters } from '@/services/aiService';

export const AI_KEYS = {
  all: ['ai'] as const,
  recommendations: (filters?: AIRecommendationFilters) => [...AI_KEYS.all, 'recommendations', filters] as const,
  detail: (id: string) => [...AI_KEYS.all, 'detail', id] as const,
};

export function useAIRecommendations(filters?: AIRecommendationFilters) {
  return useQuery({
    queryKey: AI_KEYS.recommendations(filters),
    queryFn: () => aiService.getAIRecommendations(filters),
  });
}

export function useAcceptRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recommendationId, reason }: { recommendationId: string; reason?: string }) =>
      aiService.acceptRecommendation(recommendationId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_KEYS.all });
    },
  });
}

export function useRejectRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recommendationId, reason }: { recommendationId: string; reason?: string }) =>
      aiService.rejectRecommendation(recommendationId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_KEYS.all });
    },
  });
}

export function useOverrideRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recommendationId, reason }: { recommendationId: string; reason?: string }) =>
      aiService.overrideRecommendation(recommendationId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_KEYS.all });
    },
  });
}
