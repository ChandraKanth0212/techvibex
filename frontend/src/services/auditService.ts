/**
 * RailOpt Module 4 – Audit Service
 */

import { mockStore } from './mockStore';
import type { AuditEvent } from '@/types/audit';

export interface AuditFilters {
  entityType?: string;
  userId?: string;
}

export const auditService = {
  async getAuditLog(filters?: AuditFilters): Promise<AuditEvent[]> {
    const logs = mockStore.getAuditLog();
    if (!filters) return logs;
    return logs.filter((log) => {
      if (filters.entityType && log.entityType !== filters.entityType) return false;
      if (filters.userId && log.userId !== filters.userId) return false;
      return true;
    });
  },
};
