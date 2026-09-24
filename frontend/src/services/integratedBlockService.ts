/**
 * RailOpt Module 4 – Integrated Blocks Service
 */

import { mockStore } from './mockStore';
import type { IntegratedBlock, IntegratedBlockStatus } from '@/types/block';
import type { Department } from '@/types/asset';

export interface IntegratedBlockFilters {
  department?: Department;
  sectionId?: string;
  status?: IntegratedBlockStatus;
  date?: string; // ISO date YYYY-MM-DD
}

export const integratedBlockService = {
  async getIntegratedBlocks(filters?: IntegratedBlockFilters): Promise<IntegratedBlock[]> {
    const blocks = mockStore.getIntegratedBlocks();
    if (!filters) return blocks;

    return blocks.filter((b) => {
      if (filters.department && !b.departments.includes(filters.department)) return false;
      if (filters.sectionId && b.sectionId !== filters.sectionId) return false;
      if (filters.status && b.status !== filters.status) return false;
      if (filters.date && b.date !== filters.date) return false;
      return true;
    });
  },

  async getIntegratedBlock(blockId: string): Promise<IntegratedBlock | undefined> {
    return mockStore.getIntegratedBlocks().find((b) => b.blockId === blockId);
  },

  async updateIntegratedBlockStatus(
    blockId: string,
    newStatus: IntegratedBlockStatus,
    reason?: string,
  ): Promise<boolean> {
    return mockStore.updateIntegratedBlockStatus(blockId, newStatus, 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async approveIntegratedBlock(blockId: string, reason?: string): Promise<boolean> {
    return mockStore.updateIntegratedBlockStatus(blockId, 'APPROVED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async rejectIntegratedBlock(blockId: string, reason?: string): Promise<boolean> {
    return mockStore.updateIntegratedBlockStatus(blockId, 'REJECTED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },
};
