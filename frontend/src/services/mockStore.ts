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
import type { MaintenanceTask } from '@/types/maintenance';
import type { AuditEvent } from '@/types/audit';
import type { BlockRequestStatus, IntegratedBlockStatus } from '@/types/block';
import type { ConflictResolutionStatus } from '@/types/conflict';
import type { RecommendationStatus } from '@/types/ai';
import type { TaskStatus } from '@/types/maintenance';

// ── Mutable in-session copies ─────────────────────────────────────────────────

let _blockRequests: BlockRequest[]       = [...mockBlockRequests.map((r) => ({ ...r }))];
let _integratedBlocks: IntegratedBlock[] = [...mockIntegratedBlocks.map((b) => ({ ...b }))];
let _conflicts: Conflict[]               = [...mockConflicts.map((c) => ({ ...c }))];
let _recommendations: AIRecommendation[] = [...mockAIRecommendations.map((r) => ({ ...r }))];
let _tasks: MaintenanceTask[]            = [...mockMaintenanceTasks.map((t) => ({ ...t }))];
let _auditLog: AuditEvent[]              = [...mockAuditEvents.map((e) => ({ ...e }))];

let _auditSeq = 1000; // Synthetic audit ID counter

// ── Audit log append ──────────────────────────────────────────────────────────

function _appendAudit(entry: Omit<AuditEvent, 'auditId' | 'timestamp'>): void {
  const audit: AuditEvent = {
    auditId: `AUD-PROTO-${++_auditSeq}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  _auditLog = [audit, ..._auditLog];
}

// ── Getters (return copies to avoid external mutation) ────────────────────────

export const mockStore = {
  // Getters
  getBlockRequests:     (): BlockRequest[]       => _blockRequests.map((r) => ({ ...r })),
  getIntegratedBlocks:  (): IntegratedBlock[]    => _integratedBlocks.map((b) => ({ ...b })),
  getConflicts:         (): Conflict[]           => _conflicts.map((c) => ({ ...c })),
  getRecommendations:   (): AIRecommendation[]   => _recommendations.map((r) => ({ ...r })),
  getTasks:             (): MaintenanceTask[]     => _tasks.map((t) => ({ ...t })),
  getAuditLog:          (): AuditEvent[]         => _auditLog.map((e) => ({ ...e })),

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
};
