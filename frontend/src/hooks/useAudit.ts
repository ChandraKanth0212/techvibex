import { useQuery } from '@tanstack/react-query';
import { auditService, type AuditFilters } from '@/services/auditService';

export const AUDIT_KEYS = {
  all: ['audit'] as const,
  list: (filters?: AuditFilters) => [...AUDIT_KEYS.all, 'list', filters] as const,
};

export function useAuditLog(filters?: AuditFilters) {
  return useQuery({
    queryKey: AUDIT_KEYS.list(filters),
    queryFn: () => auditService.getAuditLog(filters),
  });
}
