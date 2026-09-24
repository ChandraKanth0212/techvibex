/**
 * RailOpt Module 4 – Corridor Service
 */

import { mockRepository } from './mockRepository';
import type { Corridor, CorridorStatus } from '@/types/corridor';

export interface CorridorFilters {
  sectionId?: string;
  status?: CorridorStatus;
  date?: string; // ISO date YYYY-MM-DD
}

export const corridorService = {
  async getCorridors(filters?: CorridorFilters): Promise<Corridor[]> {
    const corridors = await mockRepository.getCorridors();
    if (!filters) return corridors;

    return corridors.filter((c) => {
      if (filters.sectionId && c.sectionId !== filters.sectionId) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.date && c.date !== filters.date) return false;
      return true;
    });
  },

  async getCorridor(corridorId: string): Promise<Corridor | undefined> {
    const corridors = await mockRepository.getCorridors();
    return corridors.find((c) => c.corridorId === corridorId);
  },
};
