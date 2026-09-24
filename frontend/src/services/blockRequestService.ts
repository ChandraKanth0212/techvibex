/**
 * RailOpt Module 4 – Block Requests Service
 */

import { mockStore } from './mockStore';
import type { BlockRequest, BlockRequestStatus } from '@/types/block';
import type { Department } from '@/types/asset';

export interface BlockRequestFilters {
  department?: Department;
  sectionId?: string;
  status?: BlockRequestStatus;
  priority?: number;
}

export const blockRequestService = {
  async getBlockRequests(filters?: BlockRequestFilters): Promise<BlockRequest[]> {
    const requests = mockStore.getBlockRequests();
    if (!filters) return requests;

    return requests.filter((r) => {
      if (filters.department && r.department !== filters.department) return false;
      if (filters.sectionId && r.sectionId !== filters.sectionId) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.priority !== undefined && r.priority !== filters.priority) return false;
      return true;
    });
  },

  async getBlockRequest(requestId: string): Promise<BlockRequest | undefined> {
    return mockStore.getBlockRequests().find((r) => r.requestId === requestId);
  },

  async approveBlockRequest(requestId: string, reason?: string): Promise<boolean> {
    return mockStore.updateBlockRequestStatus(requestId, 'APPROVED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async rejectBlockRequest(requestId: string, reason?: string): Promise<boolean> {
    return mockStore.updateBlockRequestStatus(requestId, 'REJECTED', 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },

  async updateBlockRequestStatus(
    requestId: string,
    newStatus: BlockRequestStatus,
    reason?: string,
  ): Promise<boolean> {
    return mockStore.updateBlockRequestStatus(requestId, newStatus, 'DEMO_USER', 'PLANNING_OFFICER', reason);
  },
};
