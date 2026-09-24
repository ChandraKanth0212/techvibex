/**
 * RailOpt Module 4 – Train / Timetable Service
 */

import { mockRepository } from './mockRepository';
import type { Train, TrainType, TrainStatus, GoodsForecast } from '@/types/train';

export interface TrainFilters {
  sectionId?: string;
  trainType?: TrainType;
  status?: TrainStatus;
}

export const timetableService = {
  async getTrainSchedule(filters?: TrainFilters): Promise<Train[]> {
    const trains = await mockRepository.getTrains();
    if (!filters) return trains;

    return trains.filter((t) => {
      if (filters.sectionId && t.sectionId !== filters.sectionId) return false;
      if (filters.trainType && t.trainType !== filters.trainType) return false;
      if (filters.status && t.status !== filters.status) return false;
      return true;
    });
  },

  async getGoodsForecasts(sectionId?: string): Promise<GoodsForecast[]> {
    const forecasts = await mockRepository.getGoodsForecasts();
    if (!sectionId) return forecasts;
    return forecasts.filter((f) => f.sectionId === sectionId);
  },

  async getSchedules() {
    return mockRepository.getSchedules();
  },
};
