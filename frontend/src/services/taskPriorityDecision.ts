/**
 * Phase 9B-8, Decision A — AI RECOMMENDS, A HUMAN CONFIRMS.
 *
 * The approved decision splits two roles that Phase 9B-7 kept conflating:
 *
 *   ADVISORY     an `AIRecommendation.recommendedPriority` is a model's opinion.
 *                It may be displayed, stored, logged and compared, and it is
 *                never a scheduling commitment.
 *   AUTHORITATIVE `MaintenanceTask.priority` is a decision, and it is one only
 *                once a human has confirmed it. Readiness requires that value.
 *
 * WHY THE ADVISORY VALUE IS NOT COPIED ONTO THE TASK
 * --------------------------------------------------
 * `AIRecommendation` already carries `recommendedPriority` and `priorityScore`.
 * Copying them onto `MaintenanceTask` would give the same Module 3 `PriorityLevel`
 * vocabulary two homes and leave their relationship unstated — the precise
 * ambiguity Phase 9B-7 raised when it asked which source feeds Module 3 when both
 * exist. The advice therefore stays on the recommendation, and this module joins
 * the two by `taskId` at read time.
 *
 * EVERYTHING HERE IS PURE. No input is mutated: `confirmTaskPriority` returns a
 * new task object, and repeated calls on the same input give the same result.
 */

import type { AIRecommendation } from '@/types/ai';
import type {
  MaintenanceTask,
  PriorityConfirmation,
  PriorityConfirmationInput,
} from '@/types/maintenance';
import type { OptimizerPriorityLevel } from '@/types/optimizer';
import { MODULE_3_TASK_PRIORITIES } from '@/types/optimizer';

/**
 * Runtime guard for Module 3 priority vocabulary.
 *
 * Needed because {@link confirmTaskPriority} accepts an input object that may
 * have crossed a boundary (a form, a JSON payload). A value that is not one of
 * the four is refused outright rather than passed through: a typo like
 * `CRITICAL` would otherwise reach Module 3 as a priority.
 */
export function isModule3PriorityLevel(value: unknown): value is OptimizerPriorityLevel {
  return (
    typeof value === 'string' &&
    (MODULE_3_TASK_PRIORITIES as readonly string[]).includes(value)
  );
}

/**
 * How far a task's priority has got.
 *
 * `AUTHORITATIVE` is the only status that carries a value, which is what makes
 * "the model said URGENT" structurally incapable of satisfying the gate.
 */
export type TaskPriorityStatus =
  | 'AUTHORITATIVE'
  | 'UNCONFIRMED'
  | 'RECOMMENDED'
  | 'UNAVAILABLE';

export interface AuthoritativeTaskPriority {
  readonly status: TaskPriorityStatus;
  /** Present only when `status` is `AUTHORITATIVE`. */
  readonly priority?: OptimizerPriorityLevel;
  readonly reason: string;
  /** The advisory recommendation behind this task's priority state, if any. */
  readonly recommendationId?: string;
  readonly confirmation?: PriorityConfirmation;
}

/**
 * The AI advice recorded for one task, if any.
 *
 * Join is by `AIRecommendation.taskId` — the single-task field. `affectedTaskIds`
 * is a list and is NOT used: collapsing a list into a scalar would assert that a
 * recommendation concerns exactly one task, which the list form does not say.
 * When more than one recommendation names the task, the highest-priority advice
 * is reported, deterministically, by vocabulary order rather than by array order
 * so that the result cannot depend on how the list happened to be built.
 */
export function findAdvisoryPriorityRecommendation(
  task: Pick<MaintenanceTask, 'taskId'>,
  recommendations: readonly AIRecommendation[],
): AIRecommendation | undefined {
  /**
   * Position in Module 3's own vocabulary, where index 0 is the HIGHEST
   * priority: `MODULE_3_TASK_PRIORITIES` is declared URGENT | HIGH | MEDIUM |
   * LOW, so a lower index means a more urgent suggestion.
   *
   * Advice carrying no `recommendedPriority` ranks BELOW every stated value
   * (-1), because "the model did not name a level" is weaker advice than any
   * level it could have named — not a reason to promote it.
   */
  const rank = (level: OptimizerPriorityLevel | undefined): number => {
    if (level === undefined) return -1;
    return MODULE_3_TASK_PRIORITIES.indexOf(level);
  };

  // ASCENDING rank, so the most urgent advice wins. `filter` yields a fresh array,
  // so the sort below never touches the caller's data.
  return recommendations
    .filter((r) => r.taskId === task.taskId)
    .sort((a, b) => {
      const byPriority = rank(a.recommendedPriority) - rank(b.recommendedPriority);
      if (byPriority !== 0) return byPriority;
      return a.recommendationId.localeCompare(b.recommendationId);
    })[0];
}

/**
 * Resolves whether a task has an AUTHORITATIVE Module 3 priority.
 *
 * This is the single place that decides, and it is what readiness calls. A
 * `priority` field on its own is NOT enough: without a `CONFIRMED`
 * confirmation it is an unverified value, because a value that nobody is on
 * record as having decided is not a decision. Module 3 would then apply its own
 * `MEDIUM` default to the gap, which is precisely the silent outcome Decision A
 * exists to prevent.
 */
export function resolveAuthoritativeTaskPriority(
  task: MaintenanceTask,
  recommendations: readonly AIRecommendation[] = [],
): AuthoritativeTaskPriority {
  const advisory = findAdvisoryPriorityRecommendation(task, recommendations);
  const confirmation = task.priorityConfirmation;
  const confirmed = confirmation?.state === 'CONFIRMED';

  if (task.priority !== undefined && confirmed && isModule3PriorityLevel(task.priority)) {
    return {
      status: 'AUTHORITATIVE',
      priority: task.priority,
      reason: `A human confirmed Module 3 priority ${task.priority}.`,
      recommendationId: confirmation?.recommendationId ?? advisory?.recommendationId,
      confirmation,
    };
  }

  if (task.priority !== undefined) {
    return {
      status: 'UNCONFIRMED',
      reason: `A Module 3 priority value is present but carries no CONFIRMED confirmation, so nobody is on record as having decided it. Module 3 would apply its own default to the gap, which is not a decision this application may make.`,
      recommendationId: advisory?.recommendationId,
      confirmation,
    };
  }

  if (advisory !== undefined) {
    return {
      status: 'RECOMMENDED',
      reason: advisory.recommendedPriority !== undefined
        ? `An AI recommendation suggests ${advisory.recommendedPriority}. It is ADVISORY: a recommendation never becomes MaintenanceTask.priority, and it is not counted as an authoritative priority.`
        : 'An AI recommendation exists for this task but carries no recommendedPriority, and an advisory record with no value is not a priority.',
      recommendationId: advisory.recommendationId,
    };
  }

  /**
   * Provenance recorded on the task itself, with the recommendation not supplied.
   *
   * `recordAdvisoryRecommendation` stamps `state: 'RECOMMENDED'` on the task, so
   * a reader that is handed the task but not the recommendation array must still
   * be able to see that advice was seen. Reporting `UNAVAILABLE` here would make
   * the recorded provenance unreadable by the module's own reader. It is still
   * not a priority: no value is attached, so nothing is available to copy.
   */
  if (confirmation?.state === 'RECOMMENDED') {
    return {
      status: 'RECOMMENDED',
      reason: `Advisory provenance is recorded on this task${confirmation.recommendationId !== undefined ? ` (recommendation ${confirmation.recommendationId})` : ''}, but the recommendation itself was not supplied here. It remains ADVISORY: it is not a priority and is not counted as an authoritative one.`,
      recommendationId: confirmation.recommendationId,
      confirmation,
    };
  }

  return {
    status: 'UNAVAILABLE',
    reason:
      'No Module 3 priority and no AI recommendation exist for this task. It is never computed from criticality, urgency or riskLevel.',
  };
}

/**
 * Produces a task whose priority is authoritative, WITHOUT mutating the input.
 *
 * Throws rather than coercing: a confirmation whose value is outside Module 3's
 * vocabulary is a caller error, and quietly substituting `MEDIUM` would be the
 * very invention this decision forbids. Module 4's own `criticality: 'CRITICAL'`
 * is the shape of value most likely to arrive here by mistake.
 */
export function confirmTaskPriority(
  task: MaintenanceTask,
  input: PriorityConfirmationInput,
): MaintenanceTask {
  if (!isModule3PriorityLevel(input.priority)) {
    throw new Error(
      `Refusing to confirm a priority outside Module 3's vocabulary (${MODULE_3_TASK_PRIORITIES.join(' | ')}): received ${JSON.stringify(input.priority)}.`,
    );
  }
  if (input.confirmedBy.trim().length === 0) {
    throw new Error('Refusing to confirm a priority with no named human: an unowned decision is not a decision.');
  }
  if (input.confirmedAt.trim().length === 0) {
    throw new Error('Refusing to confirm a priority with no confirmation time.');
  }

  const confirmation: PriorityConfirmation = {
    state: 'CONFIRMED',
    authority: 'HUMAN_CONFIRMED',
    ...(input.recommendationId !== undefined ? { recommendationId: input.recommendationId } : {}),
    confirmedBy: input.confirmedBy,
    confirmedAt: input.confirmedAt,
  };

  return { ...task, priority: input.priority, priorityConfirmation: confirmation };
}

/**
 * Records that advice was seen, WITHOUT it becoming a priority.
 *
 * The counterpart to {@link confirmTaskPriority}: it stamps provenance on a
 * task whose priority is still unset, so a recommendation can be displayed and
 * later traced, while leaving the gate exactly as blocked as it was. Also pure.
 */
export function recordAdvisoryRecommendation(
  task: MaintenanceTask,
  input: { readonly recommendationId: string; readonly recommendedPriority?: OptimizerPriorityLevel },
): MaintenanceTask {
  const confirmation: PriorityConfirmation = {
    state: 'RECOMMENDED',
    authority: 'AI_RECOMMENDATION_ADVISORY',
    recommendationId: input.recommendationId,
  };
  // `priority` is intentionally left as it was. Copying the recommendation here
  // is the one thing this function must never do.
  return { ...task, priorityConfirmation: confirmation };
}
