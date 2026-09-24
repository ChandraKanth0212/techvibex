/**
 * RailOpt Domain Entity: AuditEvent
 * Audit log event capturing manual overrides, approvals, and block modifications.
 */

export interface AuditEvent {
  auditId: string;
  timestamp: string; // ISO datetime string
  userId: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  previousStatus?: string;
  newStatus: string;
  reason?: string;
}
