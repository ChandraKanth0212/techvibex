/**
 * RailOpt Module 4 – Dashboard Service
 */

import { mockRepository } from './mockRepository';
import type { DashboardMetrics } from '@/types/dashboard';

export const dashboardService = {
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return mockRepository.getDashboardMetrics();
  },
};
