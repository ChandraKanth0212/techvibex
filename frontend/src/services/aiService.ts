/**
 * RailOpt Module 4 – AI Recommendations Service
 */

import { mockStore } from './mockStore';
import type { AIRecommendation, RecommendationType, RecommendationStatus } from '@/types/ai';
import type { Department } from '@/types/asset';

export interface AIRecommendationFilters {
  type?: RecommendationType;
  status?: RecommendationStatus;
  department?: Department;
}

export const aiService = {
  async getAIRecommendations(filters?: AIRecommendationFilters): Promise<AIRecommendation[]> {
    const recs = mockStore.getRecommendations();
    if (!filters) return recs;

    return recs.filter((r) => {
      if (filters.type && r.type !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.department && !r.departments.includes(filters.department)) return false;
      return true;
    });
  },

  async getAIRecommendation(recommendationId: string): Promise<AIRecommendation | undefined> {
    return mockStore.getRecommendations().find((r) => r.recommendationId === recommendationId);
  },

  async acceptRecommendation(recommendationId: string, reason?: string): Promise<boolean> {
    return mockStore.updateRecommendationStatus(recommendationId, 'ACCEPTED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async rejectRecommendation(recommendationId: string, reason?: string): Promise<boolean> {
    return mockStore.updateRecommendationStatus(recommendationId, 'REJECTED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async overrideRecommendation(recommendationId: string, reason?: string): Promise<boolean> {
    return mockStore.updateRecommendationStatus(recommendationId, 'OVERRIDDEN', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },
};
