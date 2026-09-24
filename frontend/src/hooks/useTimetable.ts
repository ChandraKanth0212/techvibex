import { useQuery } from '@tanstack/react-query';
import { timetableService, type TrainFilters } from '@/services/timetableService';

export const TIMETABLE_KEYS = {
  all: ['timetable'] as const,
  trains: (filters?: TrainFilters) => [...TIMETABLE_KEYS.all, 'trains', filters] as const,
  goods: (sectionId?: string) => [...TIMETABLE_KEYS.all, 'goods', sectionId] as const,
  schedules: () => [...TIMETABLE_KEYS.all, 'schedules'] as const,
};

export function useTrainSchedule(filters?: TrainFilters) {
  return useQuery({
    queryKey: TIMETABLE_KEYS.trains(filters),
    queryFn: () => timetableService.getTrainSchedule(filters),
  });
}

export function useGoodsForecasts(sectionId?: string) {
  return useQuery({
    queryKey: TIMETABLE_KEYS.goods(sectionId),
    queryFn: () => timetableService.getGoodsForecasts(sectionId),
  });
}

export function useSchedules() {
  return useQuery({
    queryKey: TIMETABLE_KEYS.schedules(),
    queryFn: () => timetableService.getSchedules(),
  });
}
