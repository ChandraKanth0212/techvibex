import { useQuery } from '@tanstack/react-query';
import { corridorService, type CorridorFilters } from '@/services/corridorService';

export const CORRIDOR_KEYS = {
  all: ['corridors'] as const,
  lists: () => [...CORRIDOR_KEYS.all, 'list'] as const,
  list: (filters?: CorridorFilters) => [...CORRIDOR_KEYS.lists(), filters] as const,
  detail: (id: string) => [...CORRIDOR_KEYS.all, 'detail', id] as const,
};

export function useCorridors(filters?: CorridorFilters) {
  return useQuery({
    queryKey: CORRIDOR_KEYS.list(filters),
    queryFn: () => corridorService.getCorridors(filters),
  });
}

export function useCorridor(corridorId: string) {
  return useQuery({
    queryKey: CORRIDOR_KEYS.detail(corridorId),
    queryFn: () => corridorService.getCorridor(corridorId),
    enabled: Boolean(corridorId),
  });
}
