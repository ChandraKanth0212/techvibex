/**
 * RailOpt Module 4 – Mock Store (In-Memory Mutation State)
 * Division: SECUNDERABAD (SEC)
 *
 * Provides a lightweight in-memory store for prototype UI actions.
 * Changes persist for the current browser session only (reset on refresh).
 *
 * IMPORTANT: These are prototype UI actions only.
 * They do NOT interact with any real railway system.
 *
 * Supported mutations:
 *   - Block Request: approve / reject / update status
 *   - Integrated Block: modify status
 *   - Conflict: mark resolved / under_review
 *   - AI Recommendation: acknowledge / accept / reject
 *   - Maintenance Task: defer
 *   - Maintenance Task: record a HUMAN-CONFIRMED Module 3 priority
 *   - Resource type: record a HUMAN-APPROVED Module 4 -> Module 3 correspondence
 *   - Audit log: append synthetic audit events
 */

import {
  mockBlockRequests,
  mockIntegratedBlocks,
  mockConflicts,
  mockAIRecommendations,
  mockMaintenanceTasks,
  mockAuditEvents,
} from '@/mocks';

import type { BlockRequest, IntegratedBlock } from '@/types/block';
import type { Conflict } from '@/types/conflict';
import type { AIRecommendation } from '@/types/ai';
import type { MaintenanceTask, PriorityConfirmationActor } from '@/types/maintenance';
import type { OptimizerPriorityLevel } from '@/types/optimizer';
import type { AuditEvent } from '@/types/audit';
import { RESOURCE_TYPE_MAPPING_APPROVED, TASK_PRIORITY_CONFIRMED } from '@/types/audit';
import type { BlockRequestStatus, IntegratedBlockStatus } from '@/types/block';
import type { ConflictResolutionStatus } from '@/types/conflict';
import type { RecommendationStatus } from '@/types/ai';
import type { TaskStatus } from '@/types/maintenance';
import type { ResourceType, ResourceTypeMapping } from '@/types/resource';
import type { OptimizerResourceType } from '@/types/optimizer';

// The pure, already-approved authority for a task priority. Aliased so it cannot
// be confused with this store's mutator of the same name, which is the only
// thing here permitted to write a priority onto a task.
import { confirmTaskPriority as confirmPriorityOnTask } from '@/services/taskPriorityDecision';

// The approved-authority side of the resource-type correspondence. This store is
// NOT permitted to decide a mapping: it may only hand a candidate table to
// `mapResourceType` and record the table that authority accepted. `mapResourceType`
// is imported solely for that validation and is aliased so the store's own
// `approveResourceTypeMapping` cannot be mistaken for it.
import { mapResourceType as validateAgainstMappingAuthority } from '@/services/resourceTypeMapping';

// ── Mutable in-session copies ─────────────────────────────────────────────────

let _blockRequests: BlockRequest[]       = [...mockBlockRequests.map((r) => ({ ...r }))];
let _integratedBlocks: IntegratedBlock[] = [...mockIntegratedBlocks.map((b) => ({ ...b }))];
let _conflicts: Conflict[]               = [...mockConflicts.map((c) => ({ ...c }))];
let _recommendations: AIRecommendation[] = [...mockAIRecommendations.map((r) => ({ ...r }))];
let _tasks: MaintenanceTask[]            = [...mockMaintenanceTasks.map((t) => ({ ...t }))];
let _auditLog: AuditEvent[]              = [...mockAuditEvents.map((e) => ({ ...e }))];

/**
 * The approved resource-type correspondence recorded during this session.
 *
 * EMPTY, and deliberately not seeded from `@/mocks`. This mirrors
 * `APPROVED_RESOURCE_TYPE_MAPPINGS` in `@/services/resourceTypeMapping`, which is
 * empty because no authority has approved any correspondence: the two vocabularies
 * share zero values, so every pairing is a business decision. Seeding this from the
 * mock resource list would fabricate that decision — `resourceTypeMapping.ts`
 * refuses precisely the coercions a seed would rely on (name similarity such as
 * `TRACK_MACHINE` containing `MACHINERY`, substring matching, or a fallback to
 * `MANPOWER`/`MACHINERY`), and a fabricated approval is worse than an absent one
 * because it would satisfy the readiness gate while being owned by nobody.
 *
 * It is populated only by a human supplying, explicitly, all four of: the Module 4
 * source type, the Module 3 target type, a named approver, the instant of approval,
 * a decision reference, and a mapping version.
 */
let _resourceTypeMappings: ResourceTypeMapping[] = [];

let _auditSeq = 1000; // Synthetic audit ID counter

// ── Audit log append ──────────────────────────────────────────────────────────

/**
 * Appends one audit event and returns its id.
 *
 * `timestamp` is optional so a caller that has already fixed the instant of an
 * act — a priority confirmation, where the confirmation time and the audit time
 * must be the same moment — can record that one instant rather than two that
 * differ by a few milliseconds. Every existing caller omits it and keeps the
 * previous "now" behaviour.
 */
function _appendAudit(
  entry: Omit<AuditEvent, 'auditId' | 'timestamp'> & { timestamp?: string },
): string {
  const { timestamp, ...rest } = entry;
  const audit: AuditEvent = {
    auditId: `AUD-PROTO-${++_auditSeq}`,
    timestamp: timestamp ?? new Date().toISOString(),
    ...rest,
  };
  _auditLog = [audit, ..._auditLog];
  return audit.auditId;
}

// ── Task priority confirmation ────────────────────────────────────────────────

/**
 * Why a priority confirmation did not happen.
 *
 * Named separately rather than collapsed into a single "failed" because the three
 * cases mean different things to whoever is looking at the audit trail: a task
 * that does not exist is a bad id, an unidentified actor is a refused commitment,
 * and a refusal from the authority module is a value Module 3 cannot accept.
 */
export type TaskPriorityConfirmationFailure =
  /** No task with that id. Nothing was written. */
  | 'UNKNOWN_TASK'
  /** No named human. The decision would have been unowned. */
  | 'ACTOR_NOT_IDENTIFIED'
  /** `@/services/taskPriorityDecision` refused the value. */
  | 'REFUSED';

export type TaskPriorityConfirmationResult =
  | {
      readonly ok: true;
      /** The task as persisted, carrying the authoritative priority. */
      readonly task: MaintenanceTask;
      /** Id of the audit event recording the confirmation. */
      readonly auditId: string;
    }
  | {
      readonly ok: false;
      readonly reason: TaskPriorityConfirmationFailure;
      /** The authority module's own wording, or the reason nothing was written. */
      readonly message: string;
    };

// ── Resource-type correspondence approval ─────────────────────────────────────

/**
 * Why an approval of a Module 4 -> Module 3 resource-type correspondence did not
 * happen.
 *
 * Kept apart for the same reason as the priority failures: the cases are
 * operationally different. An unidentified actor or a placeholder approver is a
 * refused commitment, a missing decision reference is a decision nobody can
 * evidence, and `REFUSED` is the authority itself declining the table.
 */
export type ResourceTypeMappingApprovalFailure =
  /** No named human in the acting role. The decision would have been unowned. */
  | 'ACTOR_NOT_IDENTIFIED'
  /** The supplied approver is the prototype placeholder, not a person. */
  | 'APPROVER_NOT_A_PERSON'
  /** No decision reference. The approval could not be audited or withdrawn later. */
  | 'REFERENCE_NOT_SUPPLIED'
  /** `@/services/resourceTypeMapping` refused the candidate table. */
  | 'REFUSED';

export interface ResourceTypeMappingApprovalInput {
  /** Module 4's own resource type, e.g. `TRACK_MACHINE`. */
  readonly module4ResourceType: ResourceType;
  /** Module 3's own resource type, e.g. `MACHINERY`. */
  readonly module3ResourceType: OptimizerResourceType;
  /** The decision this entry belongs to. Human-supplied; never defaulted. */
  readonly mappingVersion: string;
  /** The named human who decided it. */
  readonly approvedBy: string;
  /** The instant of the decision. Human-supplied; never defaulted to "now". */
  readonly approvedAt: string;
  /** The decision record (ticket, minute, approval note). */
  readonly reference: string;
  /** Who acted in the application, and in what role. */
  readonly actor: PriorityConfirmationActor;
}

export type ResourceTypeMappingApprovalResult =
  | {
      readonly ok: true;
      /** The full approved table as persisted. */
      readonly mappings: readonly ResourceTypeMapping[];
      /** The entry this approval recorded. */
      readonly mapping: ResourceTypeMapping;
      /** Id of the audit event recording the approval. */
      readonly auditId: string;
    }
  | {
      readonly ok: false;
      readonly reason: ResourceTypeMappingApprovalFailure;
      readonly message: string;
    };

// ── Getters (return copies to avoid external mutation) ────────────────────────

export const mockStore = {
  // Getters
  getBlockRequests:     (): BlockRequest[]       => _blockRequests.map((r) => ({ ...r })),
  getIntegratedBlocks:  (): IntegratedBlock[]    => _integratedBlocks.map((b) => ({ ...b })),
  getConflicts:         (): Conflict[]           => _conflicts.map((c) => ({ ...c })),
  getRecommendations:   (): AIRecommendation[]   => _recommendations.map((r) => ({ ...r })),
  getTasks:             (): MaintenanceTask[]     => _tasks.map((t) => ({ ...t })),
  getAuditLog:          (): AuditEvent[]         => _auditLog.map((e) => ({ ...e })),

  /**
   * The approved correspondence recorded so far.
   *
   * Empty until a human approves something. It is returned as the table the
   * readiness gate and the request builder both consume, so those two can never
   * consult different tables and disagree about whether `resource_type` resolved.
   */
  getResourceTypeMappings: (): ResourceTypeMapping[] =>
    _resourceTypeMappings.map((m) => ({ ...m, approval: { ...m.approval } })),

  // ── Block Request mutations ─────────────────────────────────────────────────

  updateBlockRequestStatus(
    requestId: string,
    newStatus: BlockRequestStatus,
    userId = 'DEMO_USER',
    userRole = 'PLANNING_OFFICER',
    reason?: string,
  ): boolean {
    const idx = _blockRequests.findIndex((r) => r.requestId === requestId);
    if (idx === -1) return false;
    const prev = _blockRequests[idx].status;
    _blockRequests[idx] = { ..._blockRequests[idx], status: newStatus };
    _appendAudit({
      userId,
      userRole,
      action: `Block request status changed to ${newStatus}`,
      entityType: 'BLOCK_REQUEST',
      entityId: requestId,
      previousStatus: prev,
      newStatus,
      reason,
    });
    return true;
  },

  // ── Integrated Block mutations ──────────────────────────────────────────────

  updateIntegratedBlockStatus(
    blockId: string,
    newStatus: IntegratedBlockStatus,
    userId = 'DEMO_USER',
    userRole = 'PLANNING_OFFICER',
    reason?: string,
  ): boolean {
    const idx = _integratedBlocks.findIndex((b) => b.blockId === blockId);
    if (idx === -1) return false;
    const prev = _integratedBlocks[idx].status;
    _integratedBlocks[idx] = { ..._integratedBlocks[idx], status: newStatus };
    _appendAudit({
      userId,
      userRole,
      action: `Integrated block status changed to ${newStatus}`,
      entityType: 'INTEGRATED_BLOCK',
      entityId: blockId,
      previousStatus: prev,
      newStatus,
      reason,
    });
    return true;
  },

  // ── Conflict mutations ──────────────────────────────────────────────────────

  updateConflictStatus(
    conflictId: string,
    newStatus: ConflictResolutionStatus,
    userId = 'DEMO_USER',
    userRole = 'PLANNING_OFFICER',
    reason?: string,
  ): boolean {
    const idx = _conflicts.findIndex((c) => c.conflictId === conflictId);
    if (idx === -1) return false;
    const prev = _conflicts[idx].resolutionStatus;
    _conflicts[idx] = { ..._conflicts[idx], resolutionStatus: newStatus };
    _appendAudit({
      userId,
      userRole,
      action: `Conflict marked ${newStatus}`,
      entityType: 'CONFLICT',
      entityId: conflictId,
      previousStatus: prev,
      newStatus,
      reason,
    });
    return true;
  },

  // ── AI Recommendation mutations ─────────────────────────────────────────────

  updateRecommendationStatus(
    recommendationId: string,
    newStatus: RecommendationStatus,
    userId = 'DEMO_USER',
    userRole = 'PLANNING_OFFICER',
    reason?: string,
  ): boolean {
    const idx = _recommendations.findIndex((r) => r.recommendationId === recommendationId);
    if (idx === -1) return false;
    const prev = _recommendations[idx].status;
    _recommendations[idx] = { ..._recommendations[idx], status: newStatus };
    _appendAudit({
      userId,
      userRole,
      action: `AI recommendation ${newStatus}`,
      entityType: 'AI_RECOMMENDATION',
      entityId: recommendationId,
      previousStatus: prev,
      newStatus,
      reason,
    });
    return true;
  },

  // ── Maintenance Task mutations ──────────────────────────────────────────────

  updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    userId = 'DEMO_USER',
    userRole = 'PLANNING_OFFICER',
    reason?: string,
  ): boolean {
    const idx = _tasks.findIndex((t) => t.taskId === taskId);
    if (idx === -1) return false;
    const prev = _tasks[idx].status;
    _tasks[idx] = { ..._tasks[idx], status: newStatus };
    _appendAudit({
      userId,
      userRole,
      action: `Maintenance task status changed to ${newStatus}`,
      entityType: 'MAINTENANCE_TASK',
      entityId: taskId,
      previousStatus: prev,
      newStatus,
      reason,
    });
    return true;
  },

  /**
   * Records a HUMAN-CONFIRMED Module 3 priority on a task.
   *
   * The only path by which a priority is ever written. The value is not assigned
   * here: it is produced by the already-approved
   * `confirmTaskPriority` authority, which refuses anything outside Module 3's
   * vocabulary and refuses a confirmation with no named human. This method routes
   * through that authority and persists exactly what it returns.
   *
   * NOTHING IS COPIED FROM AN AI RECOMMENDATION. A `recommendationId` may be passed
   * so the decision is traceable to the advice a person settled, and that is the
   * whole of its effect: the confirmed value is whatever the caller explicitly
   * selected, which may be a different level, or no recommendation's level at all.
   *
   * Refusals leave the store byte-for-byte unchanged. The order below is therefore
   * load-bearing — every check that can fail runs BEFORE the single assignment:
   *
   *   1. the task must exist          -> UNKNOWN_TASK
   *   2. the actor must be named      -> ACTOR_NOT_IDENTIFIED
   *   3. the authority must accept it -> REFUSED
   *   4. only then is anything written
   */
  confirmTaskPriority(
    taskId: string,
    priority: OptimizerPriorityLevel,
    actor: PriorityConfirmationActor,
    context: {
      /** The advice this decision settled, recorded for traceability only. */
      readonly recommendationId?: string;
      /** The instant of the act. Defaults to now; tests pin it. */
      readonly confirmedAt?: string;
      /** Overrides the generated audit reason. */
      readonly reason?: string;
    } = {},
  ): TaskPriorityConfirmationResult {
    const idx = _tasks.findIndex((t) => t.taskId === taskId);
    if (idx === -1) {
      return {
        ok: false,
        reason: 'UNKNOWN_TASK',
        message: `No maintenance task ${taskId} exists, so no priority can be confirmed against it.`,
      };
    }

    const userId = typeof actor?.userId === 'string' ? actor.userId.trim() : '';
    const userRole = typeof actor?.userRole === 'string' ? actor.userRole.trim() : '';
    if (userId.length === 0 || userRole.length === 0) {
      return {
        ok: false,
        reason: 'ACTOR_NOT_IDENTIFIED',
        message:
          'Refusing to confirm a priority without a named human and the role they acted in: an unowned decision is not a decision.',
      };
    }

    const confirmedAt = context.confirmedAt ?? new Date().toISOString();
    const previousPriority = _tasks[idx].priority;

    let confirmed: MaintenanceTask;
    try {
      confirmed = confirmPriorityOnTask(_tasks[idx], {
        priority,
        confirmedBy: userId,
        confirmedAt,
        ...(context.recommendationId !== undefined
          ? { recommendationId: context.recommendationId }
          : {}),
      });
    } catch (error) {
      return {
        ok: false,
        reason: 'REFUSED',
        message: error instanceof Error ? error.message : String(error),
      };
    }

    /**
     * The authority persists the value it was given, so this is an equality by
     * construction. Asserted rather than assumed because the audit record must
     * not be able to disagree with the persisted task, and because a future change
     * to the authority that stopped preserving the value should be caught here
     * rather than recorded as a decision nobody made.
     */
    if (confirmed.priority !== priority) {
      return {
        ok: false,
        reason: 'REFUSED',
        message: `Refusing to record a confirmation of ${priority} against a task the authority set to ${String(confirmed.priority)}.`,
      };
    }

    _tasks[idx] = confirmed;

    const auditId = _appendAudit({
      // The same instant as `confirmedAt`, not a second "now": one act, one time.
      timestamp: confirmedAt,
      userId,
      userRole,
      action: TASK_PRIORITY_CONFIRMED,
      entityType: 'MAINTENANCE_TASK',
      entityId: taskId,
      previousStatus: previousPriority ?? 'UNSET',
      newStatus: confirmed.priority,
      reason:
        context.reason ??
        (context.recommendationId !== undefined
          ? `A human confirmed Module 3 priority ${confirmed.priority}, settling the advice in recommendation ${context.recommendationId}. The confirmed value is the human's decision and is not copied from that recommendation.`
          : `A human confirmed Module 3 priority ${confirmed.priority}. No AI recommendation was attached to this confirmation.`),
    });

    return { ok: true, task: confirmed, auditId };
  },

  /**
   * Records a human's approval of one Module 4 -> Module 3 resource-type
   * correspondence, and returns the whole approved table.
   *
   * This method decides NOTHING about the correspondence. It checks that a person
   * is on record for the pairing and that they cited a decision record, then hands
   * the candidate table to `resourceTypeMapping.ts` — the already-approved
   * authority — and persists only what that authority accepted. Every refusal below
   * therefore ends in the same place: nothing written, no audit event, no change to
   * the readiness gate.
   *
   * Re-approving a source type that already has an entry supersedes it and keeps the
   * prior version in the audit trail, because the approval type documents that a
   * mapping must be "audited or withdrawn later" — which a table that could only
   * ever be edited in source code could not support.
   */
  approveResourceTypeMapping(
    input: ResourceTypeMappingApprovalInput,
  ): ResourceTypeMappingApprovalResult {
    const userId = typeof input.actor?.userId === 'string' ? input.actor.userId.trim() : '';
    const userRole = typeof input.actor?.userRole === 'string' ? input.actor.userRole.trim() : '';
    if (userId.length === 0 || userRole.length === 0) {
      return {
        ok: false,
        reason: 'ACTOR_NOT_IDENTIFIED',
        message:
          'Refusing to approve a resource-type correspondence without a named human and the role they acted in: an unowned decision is not a decision.',
      };
    }

    const approvedBy = typeof input.approvedBy === 'string' ? input.approvedBy.trim() : '';
    if (approvedBy.length === 0) {
      return {
        ok: false,
        reason: 'ACTOR_NOT_IDENTIFIED',
        message:
          'Refusing to approve a resource-type correspondence with no named approver. The mapping is a business decision, so it must carry the person who made it.',
      };
    }

    /**
     * The prototype placeholder is not a person. Rejected as an approver identity
     * even though it would otherwise pass the non-empty test, because an approval
     * attributed to `DEMO_USER` would satisfy the readiness gate while naming
     * nobody — the precise failure this gate exists to prevent.
     */
    if (approvedBy === 'DEMO_USER') {
      return {
        ok: false,
        reason: 'APPROVER_NOT_A_PERSON',
        message:
          'Refusing to record DEMO_USER as the approver. It is the prototype placeholder, not a person, so an approval attributed to it would be unowned.',
      };
    }

    const reference = typeof input.reference === 'string' ? input.reference.trim() : '';
    if (reference.length === 0) {
      return {
        ok: false,
        reason: 'REFERENCE_NOT_SUPPLIED',
        message:
          'Refusing to approve a resource-type correspondence with no decision reference. The approval type requires the ticket, minute or approval note so the mapping can be audited or withdrawn later.',
      };
    }

    const approvedAt = typeof input.approvedAt === 'string' ? input.approvedAt.trim() : '';
    if (approvedAt.length === 0) {
      return {
        ok: false,
        reason: 'ACTOR_NOT_IDENTIFIED',
        message:
          'Refusing to approve a resource-type correspondence with no instant of approval. The decision time is supplied by the approver, not filled in for them.',
      };
    }

    const mapping: ResourceTypeMapping = {
      module4ResourceType: input.module4ResourceType,
      module3ResourceType: input.module3ResourceType,
      mappingVersion: typeof input.mappingVersion === 'string' ? input.mappingVersion.trim() : '',
      approval: { approvedBy, approvedAt, reference },
    };

    const superseded = _resourceTypeMappings.find(
      (m) => m.module4ResourceType === mapping.module4ResourceType,
    );
    const candidate = [
      ..._resourceTypeMappings.filter((m) => m.module4ResourceType !== mapping.module4ResourceType),
      mapping,
    ];

    /**
     * The authority is consulted on the WHOLE candidate table, not just the new
     * entry, because a malformed neighbour would make the table partially unusable
     * and the gate must not be satisfied by a table that fails validation wholesale.
     */
    const verdict = validateAgainstMappingAuthority(mapping.module4ResourceType, candidate);
    if (verdict.status === 'INVALID_TABLE') {
      return { ok: false, reason: 'REFUSED', message: verdict.reason };
    }

    /**
     * Asserted, not assumed: the persisted table must resolve to exactly the pair
     * the approver signed off, so the audit record can never claim a decision the
     * authority did not make.
     */
    if (verdict.status !== 'MAPPED' || verdict.module3ResourceType !== mapping.module3ResourceType) {
      return {
        ok: false,
        reason: 'REFUSED',
        message: `Refusing to record an approval of ${mapping.module4ResourceType} -> ${mapping.module3ResourceType} that the authority resolved to ${verdict.status === 'MAPPED' ? verdict.module3ResourceType : verdict.status}.`,
      };
    }

    _resourceTypeMappings = candidate;

    const auditId = _appendAudit({
      // The decision's own instant, not a second "now": one act, one time.
      timestamp: approvedAt,
      userId,
      userRole,
      action: RESOURCE_TYPE_MAPPING_APPROVED,
      entityType: 'RESOURCE_TYPE_MAPPING',
      entityId: mapping.module4ResourceType,
      previousStatus: superseded?.mappingVersion ?? 'UNAPPROVED',
      newStatus: `${mapping.module4ResourceType}->${mapping.module3ResourceType}`,
      reason: `A human approved the Module 4 -> Module 3 resource-type correspondence ${mapping.module4ResourceType} -> ${mapping.module3ResourceType} under mapping version ${mapping.mappingVersion}. Approved by ${approvedBy} at ${approvedAt}. Decision reference: ${reference}.`,
    });

    return {
      ok: true,
      mappings: _resourceTypeMappings.map((m) => ({ ...m, approval: { ...m.approval } })),
      mapping: { ...mapping, approval: { ...mapping.approval } },
      auditId,
    };
  },

  resetStore(): void {
    _blockRequests = [...mockBlockRequests.map((r) => ({ ...r }))];
    _integratedBlocks = [...mockIntegratedBlocks.map((b) => ({ ...b }))];
    _conflicts = [...mockConflicts.map((c) => ({ ...c }))];
    _recommendations = [...mockAIRecommendations.map((r) => ({ ...r }))];
    _tasks = [...mockMaintenanceTasks.map((t) => ({ ...t }))];
    _auditLog = [...mockAuditEvents.map((e) => ({ ...e }))];
    _resourceTypeMappings = [];
  },
};
