/**
 * RailOpt Domain Entity: MaintenanceTask
 * Represents maintenance work orders requested across railway engineering departments.
 */

import { Department, CriticalityLevel } from './asset';
import { FailureRiskLevel } from './defect';
import type { OptimizerPriorityLevel, OptimizerWorkType } from './optimizer';

export type TaskStatus =
  | 'PENDING'
  | 'PRIORITIZED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DEFERRED'
  | 'CANCELLED';

export type BlockType = 'CORRIDOR' | 'SHADOW' | 'EMERGENCY' | 'ROUTINE';
export type UrgencyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9B-8, Decision A: AI recommends, a human confirms.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who is entitled to make `MaintenanceTask.priority` authoritative.
 *
 * The approved decision splits the two roles that Phase 9B-7 kept conflating:
 * an AI recommendation is ADVISORY, and only a human confirmation makes a value
 * authoritative. Recording the authority alongside the value is what lets a
 * reader tell "the model suggested URGENT" apart from "a planner decided
 * URGENT", which are different statements about the same field.
 */
export type PriorityAuthority = 'AI_RECOMMENDATION_ADVISORY' | 'HUMAN_CONFIRMED';

/**
 * Provenance of {@link MaintenanceTask.priority}.
 *
 * `CONFIRMED` is the only state that makes the value authoritative, and it is
 * what readiness requires. A bare `priority` with no confirmation, or a
 * `RECOMMENDED` state that merely restates an AI suggestion, is not a decision.
 */
export type PriorityConfirmationState = 'RECOMMENDED' | 'CONFIRMED';

export interface PriorityConfirmation {
  readonly state: PriorityConfirmationState;
  readonly authority: PriorityAuthority;
  /**
   * The `AIRecommendation.recommendationId` this value came from, when it came
   * from one. Recorded so a confirmation can be traced to the advice it settled,
   * and so a recommendation that was NOT taken is still visible as declined
   * rather than quietly deleted.
   */
  readonly recommendationId?: string;
  /** Required whenever `state` is `CONFIRMED`: the human who decided. */
  readonly confirmedBy?: string;
  /** ISO datetime string. Required whenever `state` is `CONFIRMED`. */
  readonly confirmedAt?: string;
}

/**
 * The confirmation a human gives. Kept separate from {@link PriorityConfirmation}
 * so the input side cannot smuggle in an `authority` or a `state` it did not earn.
 */
export interface PriorityConfirmationInput {
  readonly priority: OptimizerPriorityLevel;
  readonly confirmedBy: string;
  readonly confirmedAt: string;
  readonly recommendationId?: string;
}

export interface MaintenanceTask {
  taskId: string;
  assetId: string;
  department: Department;
  workType: string;
  sectionId: string;
  corridorId?: string;
  location: string;
  requestedDate: string; // ISO date string (YYYY-MM-DD)
  preferredStart: string; // ISO datetime string (YYYY-MM-DDTHH:mm:ssZ)
  preferredEnd: string; // ISO datetime string (YYYY-MM-DDTHH:mm:ssZ)
  durationMinutes: number;
  criticality: CriticalityLevel;
  urgency: UrgencyLevel;
  overdueDays: number;
  riskLevel: FailureRiskLevel;
  /**
   * Module 3 `MaintenanceTask.priority`, in Module 3's own vocabulary
   * (LOW | MEDIUM | HIGH | URGENT).
   *
   * This is a SEPARATE axis from `criticality`, `urgency` and `riskLevel`, and
   * it is never computed from them. Module 4 has `criticality: 'CRITICAL'`, which
   * Module 3 cannot express, and Module 3 has `URGENT`, which Module 4 cannot
   * express; any conversion in either direction would invent a scheduling
   * commitment.
   *
   * Phase 9B-8 Decision A: a value here is AUTHORITATIVE only when
   * `priorityConfirmation.state` is `CONFIRMED`. An AI `recommendedPriority` is
   * advisory and never lands here on its own, so a task without a confirmation
   * has no Module 3 priority and stays without one. See
   * {@link resolveAuthoritativeTaskPriority} in `@/services/taskPriorityDecision`.
   */
  priority?: OptimizerPriorityLevel;
  /**
   * Provenance for {@link priority}, and the only thing that makes it count.
   *
   * Deliberately NOT recorded here: `recommendedPriority` and `priorityScore`.
   * Both already live on `AIRecommendation` (@/types/ai), which is where advice
   * belongs. Copying them onto the task would create a second home for the same
   * Module 3 `PriorityLevel` vocabulary and reintroduce exactly the ambiguity
   * this decision was taken to remove: two fields, one meaning, no stated
   * relationship. The advisory value is read from the recommendation instead.
   */
  priorityConfirmation?: PriorityConfirmation;
  /**
   * Module 3 `MaintenanceTask.work_type`, in Module 3's own vocabulary
   * (PREVENTIVE | CORRECTIVE | INSPECTION | REPAIR | REPLACEMENT | UPGRADE).
   *
   * Module 3 declares `work_type` with NO default, so a task without it cannot
   * be sent. `workType` above is a free-text Module 4 field whose values are not
   * this vocabulary, and deriving one from the other would invent a maintenance
   * commitment. This field stays unset until a person states it.
   */
  module3WorkType?: OptimizerWorkType;
  /**
   * Module 3 `MaintenanceTask.due_by` (a date), declared with NO default.
   *
   * NOT the same as `requestedDate`. `requestedDate` is when the work was asked
   * for; `due_by` is the deadline Module 3 schedules against. Treating one as
   * the other would silently move a deadline, so they stay separate and this
   * field stays unset until a person states it.
   */
  dueBy?: string;
  blockType: BlockType;
  requiredResources: string[];
  status: TaskStatus;
  defectId?: string;
}
