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

/**
 * Audit action for a human confirming a maintenance task's Module 3 priority.
 *
 * A new value rather than a reuse: the seeded log's actions
 * (`BLOCK_CREATED`, `AI_RECOMMENDATION_GENERATED`, `AI_RECOMMENDATION_ACCEPTED`,
 * ...) each describe a block or a recommendation, and none of them says that a
 * person settled a task's scheduling priority. Overloading `AI_RECOMMENDATION_ACCEPTED`
 * would be worse than a gap, because accepting a recommendation and deciding a
 * priority are the two acts Decision A exists to keep apart — an accept is the
 * model's advice being acknowledged, a confirmation is a person being on record.
 *
 * The confirmed value is carried in `newStatus` (and any previous value in
 * `previousStatus`), matching how every other value transition in this log is
 * recorded, so the decision is attributable and searchable without a new
 * subsystem.
 */
export const TASK_PRIORITY_CONFIRMED = 'TASK_PRIORITY_CONFIRMED' as const;
export type TaskPriorityConfirmedAction = typeof TASK_PRIORITY_CONFIRMED;

/**
 * Audit action for a human approving a Module 4 -> Module 3 resource-type
 * correspondence.
 *
 * A new value for the same reason as above: the two existing families describe a
 * block/request or a recommendation, and none of them says that a person decided
 * how one module's resource vocabulary corresponds to another's. That act is the
 * one `resolvableByUserAction` blockers wait on, so it has to be attributable to
 * the person who made it and to the decision record they cited.
 *
 * The decided pair is carried in `newStatus` (`M4_TYPE->M3_TYPE`) and the approval
 * record — approver, instant and reference — is carried in `reason`, so the log
 * keeps the human's identity and the evidence for the decision without a new
 * subsystem. Any previously approved version is kept in `previousStatus`, so a
 * supersession is visible rather than silent.
 */
export const RESOURCE_TYPE_MAPPING_APPROVED = 'RESOURCE_TYPE_MAPPING_APPROVED' as const;
export type ResourceTypeMappingApprovedAction = typeof RESOURCE_TYPE_MAPPING_APPROVED;
