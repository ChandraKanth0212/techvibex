/**
 * END-TO-END HUMAN PRIORITY CONFIRMATION.
 *
 * `@/services/__tests__/taskPriorityDecision.test.ts` proves the decision
 * LOGIC: that advice is advisory and a confirmed value is authoritative. This
 * file proves the PATH, which was the gap it left — the approved authority had
 * no production caller, so `confirmTaskPriority` was reachable only from a test
 * and every real task sat permanently unconfirmed.
 *
 * The path under test:
 *
 *   a human selects a level and states who they are
 *     -> mockStore.confirmTaskPriority
 *        -> confirmTaskPriority (the approved authority, unchanged)
 *        -> task.priority + PriorityConfirmation persisted
 *        -> TASK_PRIORITY_CONFIRMED audit event appended
 *     -> resolveAuthoritativeTaskPriority reports AUTHORITATIVE
 *
 * What these tests hold the implementation to:
 *
 *   - a recommendation NEVER becomes the priority, on any path
 *   - the persisted value is EXACTLY what the human selected, even when it
 *     disagrees with the advice
 *   - a refusal writes NOTHING — no priority, no confirmation, no audit event
 *   - the actor is required and is never defaulted
 *   - the audit event names the person, the task, the value and the instant
 *   - the existing mocks are not a source of confirmations: no task starts
 *     confirmed, and this file never invents one to make a test pass
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockStore, type TaskPriorityConfirmationResult } from '@/services/mockStore';
import { maintenanceService } from '@/services/maintenanceService';
import { resolveAuthoritativeTaskPriority } from '@/services/taskPriorityDecision';
import { assessModule4Readiness, type Module4ReadinessSnapshot } from '@/services/optimizerRequestReadiness';
import { INITIAL_PLANNER_SCOPE } from '@/utils/plannerScope';
import { TASK_PRIORITY_CONFIRMED } from '@/types/audit';
import type { AIRecommendation } from '@/types/ai';
import type { PriorityConfirmationActor } from '@/types/maintenance';
import type { OptimizerPriorityLevel } from '@/types/optimizer';
import {
  mockAIRecommendations,
  mockAssets,
  mockBlockRequests,
  mockCorridors,
  mockGoodsForecasts,
  mockIntegratedBlocks,
  mockMaintenanceTasks,
  mockResources,
  mockTrains,
} from '@/mocks';

const TASK_ID = mockMaintenanceTasks[0].taskId;

/** A real, named person. Never defaulted anywhere in the code under test. */
const ACTOR: PriorityConfirmationActor = {
  userId: 'planner.rai',
  userRole: 'Divisional Operations Manager',
};

const CONFIRMED_AT = '2026-01-15T09:00:00Z';

function taskInStore(taskId: string = TASK_ID) {
  const found = mockStore.getTasks().find((t) => t.taskId === taskId);
  if (!found) throw new Error(`no task ${taskId} in the store`);
  return found;
}

/** A recommendation that names THIS task, so the advisory path is reachable. */
function adviceForTask(taskId: string = TASK_ID): AIRecommendation {
  return {
    ...mockAIRecommendations[0],
    recommendationId: 'REC-TEST-ADVISORY',
    taskId,
    recommendedPriority: 'URGENT',
    priorityScore: 0.93,
  };
}

function expectConfirmed(result: TaskPriorityConfirmationResult) {
  if (!result.ok) {
    throw new Error(`expected the confirmation to succeed, got ${result.reason}: ${result.message}`);
  }
  return result;
}

function expectRefused(result: TaskPriorityConfirmationResult) {
  if (result.ok) {
    throw new Error('expected the confirmation to be refused, but it succeeded');
  }
  return result;
}

beforeEach(() => {
  mockStore.resetStore();
});

// ── A. A recommendation alone is not a decision ───────────────────────────────

describe('A. a recommendation on its own leaves the task non-authoritative', () => {
  it('leaves the task non-authoritative and unconfirmed', () => {
    const recommendation = adviceForTask();
    const before = taskInStore();

    // The recommendation is real, task-level advice. Nothing has been confirmed.
    const resolved = resolveAuthoritativeTaskPriority(before, [recommendation]);
    expect(resolved.status).toBe('RECOMMENDED');
    expect(resolved.priority).toBeUndefined();

    // And no store operation anywhere has turned it into a priority.
    const after = taskInStore();
    expect(after.priority).toBeUndefined();
    expect(after.priorityConfirmation).toBeUndefined();
  });

  it('leaves every real mock task unconfirmed, because no mock task is confirmed', () => {
    // The shipped world has no confirmations, and this batch must not invent any.
    expect(mockStore.getTasks().every((t) => t.priority === undefined)).toBe(true);
    expect(mockStore.getTasks().every((t) => t.priorityConfirmation === undefined)).toBe(true);
  });
});

// ── B. An explicit human confirmation makes it authoritative ──────────────────

describe('B. an explicit human confirmation makes the priority authoritative', () => {
  it('persists exactly the selected value with a CONFIRMED provenance', () => {
    const result = expectConfirmed(
      mockStore.confirmTaskPriority(TASK_ID, 'HIGH', ACTOR, { confirmedAt: CONFIRMED_AT }),
    );

    const task = taskInStore();
    expect(task.priority).toBe('HIGH');
    expect(task.priorityConfirmation).toEqual({
      state: 'CONFIRMED',
      authority: 'HUMAN_CONFIRMED',
      confirmedBy: ACTOR.userId,
      confirmedAt: CONFIRMED_AT,
    });

    const resolved = resolveAuthoritativeTaskPriority(task);
    expect(resolved.status).toBe('AUTHORITATIVE');
    expect(resolved.priority).toBe('HIGH');
    expect(result.task.priority).toBe('HIGH');
  });

  it('does NOT copy the recommendation, even when a recommendation exists', () => {
    // The advice says URGENT. Confirming HIGH must record HIGH.
    const recommendation = adviceForTask();
    expectConfirmed(
      mockStore.confirmTaskPriority(TASK_ID, 'HIGH', ACTOR, {
        confirmedAt: CONFIRMED_AT,
        recommendationId: recommendation.recommendationId,
      }),
    );

    const task = taskInStore();
    expect(task.priority).toBe('HIGH');
    expect(task.priority).not.toBe(recommendation.recommendedPriority);
    // The advice itself is untouched and still advisory.
    expect(recommendation.recommendedPriority).toBe('URGENT');
    expect(resolveAuthoritativeTaskPriority(task, [recommendation]).priority).toBe('HIGH');
  });

  it('modifies no unrelated task field', () => {
    const before = taskInStore();
    expectConfirmed(mockStore.confirmTaskPriority(TASK_ID, 'MEDIUM', ACTOR, { confirmedAt: CONFIRMED_AT }));
    const after = taskInStore();

    // Every field the task already had is carried over untouched...
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(after[key]).toEqual(before[key]);
    }
    // ...and the ONLY fields added are the two the confirmation is allowed to add.
    // `priority` and `priorityConfirmation` are absent before a confirmation, so
    // adding them is the change itself rather than a modification of anything else.
    expect(Object.keys(before)).not.toContain('priority');
    expect(Object.keys(before)).not.toContain('priorityConfirmation');
    const added = Object.keys(after).filter((k) => !(k in before));
    expect(added.sort()).toEqual(['priority', 'priorityConfirmation']);
  });

  it('accepts every Module 3 priority level and nothing outside it', () => {
    for (const level of ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as OptimizerPriorityLevel[]) {
      mockStore.resetStore();
      expectConfirmed(mockStore.confirmTaskPriority(TASK_ID, level, ACTOR, { confirmedAt: CONFIRMED_AT }));
      expect(resolveAuthoritativeTaskPriority(taskInStore()).priority).toBe(level);
    }
  });
});

// ── C. The confirmed value wins over a disagreeing recommendation ────────────

describe('C. a confirmed value that differs from the recommendation wins', () => {
  it('persists the human value and leaves the advice visible as history', () => {
    const recommendation = adviceForTask();
    expectConfirmed(
      mockStore.confirmTaskPriority(TASK_ID, 'LOW', ACTOR, {
        confirmedAt: CONFIRMED_AT,
        recommendationId: recommendation.recommendationId,
      }),
    );

    const task = taskInStore();
    const resolved = resolveAuthoritativeTaskPriority(task, [recommendation]);

    expect(task.priority).toBe('LOW');
    expect(resolved.status).toBe('AUTHORITATIVE');
    expect(resolved.priority).toBe('LOW');
    // The advice is still on the record and still says something different, so a
    // declined recommendation stays visible rather than being overwritten.
    expect(recommendation.recommendedPriority).toBe('URGENT');
    expect(resolved.recommendationId).toBe('REC-TEST-ADVISORY');
    expect(task.priorityConfirmation?.recommendationId).toBe('REC-TEST-ADVISORY');
  });

  it('re-confirming replaces the value and records the new person', () => {
    expectConfirmed(mockStore.confirmTaskPriority(TASK_ID, 'LOW', ACTOR, { confirmedAt: CONFIRMED_AT }));
    expectConfirmed(
      mockStore.confirmTaskPriority(
        TASK_ID,
        'URGENT',
        { userId: 'den.sharma', userRole: 'Divisional Engineer (DEN/Track)' },
        { confirmedAt: '2026-01-16T11:30:00Z' },
      ),
    );

    const task = taskInStore();
    expect(task.priority).toBe('URGENT');
    expect(task.priorityConfirmation?.confirmedBy).toBe('den.sharma');
    expect(task.priorityConfirmation?.confirmedAt).toBe('2026-01-16T11:30:00Z');
  });
});

// ── D/E/F. Refusals write nothing ────────────────────────────────────────────

describe('D. an invalid priority is refused and the task is unchanged', () => {
  it('refuses a Module 4 value rather than coercing it', () => {
    const before = JSON.stringify(taskInStore());
    const auditBefore = mockStore.getAuditLog().length;

    const refused = expectRefused(
      mockStore.confirmTaskPriority(
        TASK_ID,
        'CRITICAL' as unknown as OptimizerPriorityLevel,
        ACTOR,
        { confirmedAt: CONFIRMED_AT },
      ),
    );

    expect(refused.reason).toBe('REFUSED');
    expect(refused.message).toContain("outside Module 3's vocabulary");
    expect(JSON.stringify(taskInStore())).toBe(before);
    expect(mockStore.getAuditLog().length).toBe(auditBefore);
  });
});

describe('E. a missing or invalid actor is refused and the task is unchanged', () => {
  const badActors: [string, unknown][] = [
    ['blank userId', { userId: '   ', userRole: 'Planning Officer' }],
    ['blank userRole', { userId: 'planner.rai', userRole: '  ' }],
    ['absent userId', { userRole: 'Planning Officer' }],
    ['not an object', undefined],
  ];

  for (const [label, actor] of badActors) {
    it(`refuses a confirmation with ${label}`, () => {
      const before = JSON.stringify(taskInStore());
      const auditBefore = mockStore.getAuditLog().length;

      const refused = expectRefused(
        mockStore.confirmTaskPriority(
          TASK_ID,
          'HIGH',
          actor as PriorityConfirmationActor,
          { confirmedAt: CONFIRMED_AT },
        ),
      );

      expect(refused.reason).toBe('ACTOR_NOT_IDENTIFIED');
      expect(refused.message).toContain('unowned decision is not a decision');
      expect(JSON.stringify(taskInStore())).toBe(before);
      expect(mockStore.getAuditLog().length).toBe(auditBefore);
    });
  }
});

describe('F. an unknown task is refused', () => {
  it('reports UNKNOWN_TASK and writes nothing', () => {
    const auditBefore = mockStore.getAuditLog().length;
    const refused = expectRefused(
      mockStore.confirmTaskPriority('TSK-DOES-NOT-EXIST', 'HIGH', ACTOR, { confirmedAt: CONFIRMED_AT }),
    );

    expect(refused.reason).toBe('UNKNOWN_TASK');
    expect(refused.message).toContain('TSK-DOES-NOT-EXIST');
    expect(mockStore.getTasks().some((t) => t.taskId === 'TSK-DOES-NOT-EXIST')).toBe(false);
    expect(mockStore.getAuditLog().length).toBe(auditBefore);
  });
});

// ── G. The audit event is attributable ───────────────────────────────────────

describe('G. a successful confirmation writes an attributable audit event', () => {
  it('names the actor, the task, the value and the instant', () => {
    const result = expectConfirmed(
      mockStore.confirmTaskPriority(TASK_ID, 'URGENT', ACTOR, {
        confirmedAt: CONFIRMED_AT,
        recommendationId: 'REC-TEST-ADVISORY',
      }),
    );

    const event = mockStore
      .getAuditLog()
      .find((e) => e.auditId === result.auditId);
    if (!event) throw new Error('no audit event was appended');

    expect(event.action).toBe(TASK_PRIORITY_CONFIRMED);
    expect(event.entityType).toBe('MAINTENANCE_TASK');
    expect(event.entityId).toBe(TASK_ID);
    expect(event.userId).toBe(ACTOR.userId);
    expect(event.userRole).toBe(ACTOR.userRole);
    expect(event.newStatus).toBe('URGENT');
    expect(event.previousStatus).toBe('UNSET');
    // One act, one instant: the audit time is the confirmation time.
    expect(event.timestamp).toBe(CONFIRMED_AT);
    expect(event.reason).toContain('REC-TEST-ADVISORY');
    // The seeded actor defaults must never appear on a confirmation.
    expect(event.userId).not.toBe('DEMO_USER');
  });

  it('records the previous value when a priority is re-confirmed', () => {
    expectConfirmed(mockStore.confirmTaskPriority(TASK_ID, 'LOW', ACTOR, { confirmedAt: CONFIRMED_AT }));
    const result = expectConfirmed(
      mockStore.confirmTaskPriority(
        TASK_ID,
        'URGENT',
        { userId: 'den.sharma', userRole: 'Divisional Engineer (DEN/Track)' },
        { confirmedAt: '2026-01-16T11:30:00Z' },
      ),
    );

    const event = mockStore.getAuditLog().find((e) => e.auditId === result.auditId);
    expect(event?.previousStatus).toBe('LOW');
    expect(event?.newStatus).toBe('URGENT');
  });

  it('appends exactly one event per successful confirmation', () => {
    const before = mockStore.getAuditLog().length;
    expectConfirmed(mockStore.confirmTaskPriority(TASK_ID, 'HIGH', ACTOR, { confirmedAt: CONFIRMED_AT }));
    expect(mockStore.getAuditLog().length).toBe(before + 1);
  });
});

// ── H. Service round-trip, through to the readiness gate ─────────────────────

describe('H. confirm -> persisted task -> readiness sees an authoritative priority', () => {
  function snapshot(): Module4ReadinessSnapshot {
    return {
      tasks: mockStore.getTasks(),
      blockRequests: mockBlockRequests,
      assets: mockAssets,
      trains: mockTrains,
      goodsForecasts: mockGoodsForecasts,
      resources: mockResources,
      corridors: mockCorridors,
      integratedBlocks: mockIntegratedBlocks,
      occupancies: [],
      recommendations: mockAIRecommendations,
      scope: INITIAL_PLANNER_SCOPE,
    };
  }

  function priorityInput() {
    const readiness = assessModule4Readiness(snapshot());
    const input = readiness.inputs.find((i) => i.id === 'tasks.priority');
    if (!input) throw new Error('no tasks.priority readiness input');
    return input;
  }

  it('is refused as authoritative before any confirmation, and recognised after one', async () => {
    // Before: the gate reports no authoritative priority at all.
    const before = priorityInput();
    expect(before.coverage?.present ?? 0).toBe(0);
    expect(before.status).not.toBe('AVAILABLE');

    // The real service method, as the UI calls it.
    const result = expectConfirmed(
      await maintenanceService.confirmTaskPriority(TASK_ID, 'HIGH', ACTOR, {
        confirmedAt: CONFIRMED_AT,
      }),
    );
    expect(result.task.priority).toBe('HIGH');

    // After: the persisted task is what readiness reads, and this task now counts.
    // The input is per-COLLECTION, so confirming one of many tasks is PARTIAL
    // rather than AVAILABLE — the gate is not satisfied by a single act.
    const after = priorityInput();
    expect(after.coverage?.present).toBe(1);
    expect(after.coverage?.total).toBe(mockStore.getTasks().length);
    expect(after.status).toBe('PARTIAL');

    // The service read-back agrees with the store.
    const readBack = await maintenanceService.getMaintenanceTask(TASK_ID);
    expect(readBack?.priority).toBe('HIGH');
    expect(resolveAuthoritativeTaskPriority(readBack!).status).toBe('AUTHORITATIVE');
  });

  it('reaches AVAILABLE once every task has been confirmed by a human', async () => {
    // The point of this batch: `tasks.priority` is the one blocker declared
    // `resolvableByUserAction`, and this is that proof. Nothing is defaulted and
    // nothing is derived — each task is confirmed on its own by a named person.
    expect(priorityInput().status).not.toBe('AVAILABLE');

    for (const task of mockStore.getTasks()) {
      expectConfirmed(
        await maintenanceService.confirmTaskPriority(task.taskId, 'MEDIUM', ACTOR, {
          confirmedAt: CONFIRMED_AT,
        }),
      );
    }

    const after = priorityInput();
    expect(after.coverage?.present).toBe(after.coverage?.total);
    expect(after.status).toBe('AVAILABLE');
    // Every task is now a decision, not a derivation.
    expect(
      mockStore.getTasks().every(
        (t) => resolveAuthoritativeTaskPriority(t).status === 'AUTHORITATIVE',
      ),
    ).toBe(true);
  });

  it('a refused confirmation leaves readiness exactly where it was', async () => {
    const before = priorityInput();
    const refused = expectRefused(
      await maintenanceService.confirmTaskPriority(
        TASK_ID,
        'CRITICAL' as unknown as OptimizerPriorityLevel,
        ACTOR,
        { confirmedAt: CONFIRMED_AT },
      ),
    );
    expect(refused.reason).toBe('REFUSED');
    expect(priorityInput().coverage?.present ?? 0).toBe(0);
    expect(priorityInput().status).toBe(before.status);
  });
});

// ── I. Nothing is fabricated to make any of this work ────────────────────────

describe('I. no fabricated initial data', () => {
  it('leaves the mock source arrays untouched', () => {
    const tasksBefore = JSON.stringify(mockMaintenanceTasks);
    const recommendationsBefore = JSON.stringify(mockAIRecommendations);
    const auditBefore = JSON.stringify(mockStore.getAuditLog());

    expectConfirmed(mockStore.confirmTaskPriority(TASK_ID, 'HIGH', ACTOR, { confirmedAt: CONFIRMED_AT }));
    mockStore.resetStore();

    expect(JSON.stringify(mockMaintenanceTasks)).toBe(tasksBefore);
    expect(JSON.stringify(mockAIRecommendations)).toBe(recommendationsBefore);
    expect(JSON.stringify(mockStore.getAuditLog())).toBe(auditBefore);
  });

  it('ships no task with a priority or a confirmation already on it', () => {
    expect(mockMaintenanceTasks.every((t) => t.priority === undefined)).toBe(true);
    expect(mockMaintenanceTasks.every((t) => t.priorityConfirmation === undefined)).toBe(true);
  });

  it('ships no recommendation that names a single task, so none is a confirmed-value source', () => {
    // Every mock recommendation carries `affectedTaskIds` only. A list is not a
    // scalar, which is why the UI has no task-level advice to show and why no
    // confirmation in this file could have been driven from one.
    expect(mockAIRecommendations.every((r) => r.taskId === undefined)).toBe(true);
    expect(mockAIRecommendations.every((r) => r.recommendedPriority === undefined)).toBe(true);
  });

  it('resets to an unconfirmed world', () => {
    expectConfirmed(mockStore.confirmTaskPriority(TASK_ID, 'URGENT', ACTOR, { confirmedAt: CONFIRMED_AT }));
    mockStore.resetStore();
    expect(resolveAuthoritativeTaskPriority(taskInStore()).status).toBe('UNAVAILABLE');
  });
});
