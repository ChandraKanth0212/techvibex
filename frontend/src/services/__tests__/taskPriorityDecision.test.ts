/**
 * Phase 9B-8, Decision A — AI RECOMMENDS, A HUMAN CONFIRMS.
 *
 * The decision being defended: an `AIRecommendation.recommendedPriority` is
 * ADVISORY, and `MaintenanceTask.priority` is AUTHORITATIVE only once a person
 * has confirmed it. These tests are written so that each of the ways the
 * distinction could quietly collapse fails loudly:
 *
 *   - a recommendation silently becoming a priority
 *   - a bare `priority` value counting as a decision
 *   - Module 4's own vocabulary (`CRITICAL`) being confirmed as a Module 3 one
 *   - a confirmation being computed from criticality/urgency/risk
 *   - input objects being mutated rather than copied
 *   - the resolution depending on iteration order
 */

import { describe, expect, it } from 'vitest';
import {
  confirmTaskPriority,
  findAdvisoryPriorityRecommendation,
  isModule3PriorityLevel,
  recordAdvisoryRecommendation,
  resolveAuthoritativeTaskPriority,
} from '@/services/taskPriorityDecision';
import { mockAIRecommendations, mockMaintenanceTasks } from '@/mocks';
import type { AIRecommendation } from '@/types/ai';
import type { MaintenanceTask } from '@/types/maintenance';
import { MODULE_3_TASK_PRIORITIES, type OptimizerPriorityLevel } from '@/types/optimizer';

const TASK = mockMaintenanceTasks[0];

/** A recommendation for `TASK`, optionally advising a priority. */
function advice(
  overrides: Partial<AIRecommendation> = {},
): AIRecommendation {
  return {
    ...mockAIRecommendations[0],
    recommendationId: 'AIR-TEST-1',
    taskId: TASK.taskId,
    recommendedPriority: 'URGENT',
    priorityScore: 0.93,
    ...overrides,
  };
}

describe('an AI recommendation is advisory', () => {
  it('does NOT become MaintenanceTask.priority', () => {
    const recommendation = advice();
    const task: MaintenanceTask = { ...TASK };
    // Resolution is a READ. Nothing in it writes a priority onto the task.
    const resolved = resolveAuthoritativeTaskPriority(task, [recommendation]);

    expect(resolved.status).toBe('RECOMMENDED');
    expect(resolved.priority).toBeUndefined();
    expect(task.priority).toBeUndefined();
    expect(resolved.recommendationId).toBe('AIR-TEST-1');
    expect(resolved.reason).toContain('ADVISORY');
  });

  it('leaves an existing unconfirmed priority unresolved rather than confirming it', () => {
    // A priority value plus an AI recommendation is still not a decision. The two
    // must not combine into one.
    const resolved = resolveAuthoritativeTaskPriority(
      { ...TASK, priority: 'HIGH' },
      [advice({ recommendedPriority: 'URGENT' })],
    );
    expect(resolved.status).toBe('UNCONFIRMED');
    expect(resolved.priority).toBeUndefined();
  });

  it('is recorded as provenance without becoming a priority', () => {
    const task = recordAdvisoryRecommendation({ ...TASK }, { recommendationId: 'AIR-TEST-1' });
    expect(task.priority).toBeUndefined();
    expect(task.priorityConfirmation).toEqual({
      state: 'RECOMMENDED',
      authority: 'AI_RECOMMENDATION_ADVISORY',
      recommendationId: 'AIR-TEST-1',
    });
    expect(resolveAuthoritativeTaskPriority(task).status).toBe('RECOMMENDED');
  });

  it('never infers a priority from criticality, urgency or riskLevel', () => {
    // The mock set carries every Module 4 criticality/urgency/risk value, and
    // still none of them resolves.
    const resolved = resolveAuthoritativeTaskPriority(TASK, mockAIRecommendations);
    expect(resolved.status).toBe('UNAVAILABLE');
    expect(resolved.priority).toBeUndefined();
    expect(TASK.priority).toBeUndefined();
    expect(mockMaintenanceTasks.every((t) => t.priority === undefined)).toBe(true);
  });

  it('is not even read from a recommendation that only carries a task LIST', () => {
    // Stronger than "advisory": every mock recommendation names tasks through
    // `affectedTaskIds` and carries no `taskId`, so none of them is advice about
    // a single task at all. A one-element list is not a scalar.
    expect(mockAIRecommendations.every((r) => r.taskId === undefined)).toBe(true);
    expect(
      mockAIRecommendations.some((r) => r.affectedTaskIds.includes(TASK.taskId)),
    ).toBe(true);
    expect(findAdvisoryPriorityRecommendation(TASK, mockAIRecommendations)).toBeUndefined();
    expect(resolveAuthoritativeTaskPriority(TASK, mockAIRecommendations).status).toBe(
      'UNAVAILABLE',
    );
  });

  it('reports UNAVAILABLE when neither a recommendation nor a priority exists', () => {
    const resolved = resolveAuthoritativeTaskPriority({ ...TASK }, []);
    expect(resolved.status).toBe('UNAVAILABLE');
    expect(resolved.priority).toBeUndefined();
  });

  it('reports an advisory record carrying no recommendedPriority as no value', () => {
    const resolved = resolveAuthoritativeTaskPriority(
      { ...TASK },
      [advice({ recommendedPriority: undefined })],
    );
    expect(resolved.status).toBe('RECOMMENDED');
    expect(resolved.priority).toBeUndefined();
    expect(resolved.reason).toContain('advisory record with no value is not a priority');
  });
});

describe('a human confirmation makes a priority authoritative', () => {
  it('resolves to AUTHORITATIVE with the confirmed value', () => {
    const confirmed = confirmTaskPriority({ ...TASK }, {
      priority: 'HIGH',
      confirmedBy: 'planner.rai',
      confirmedAt: '2026-01-15T09:00:00Z',
    });
    const resolved = resolveAuthoritativeTaskPriority(confirmed);

    expect(resolved.status).toBe('AUTHORITATIVE');
    expect(resolved.priority).toBe('HIGH');
    expect(resolved.confirmation?.confirmedBy).toBe('planner.rai');
    expect(resolved.confirmation?.confirmedAt).toBe('2026-01-15T09:00:00Z');
    expect(resolved.confirmation?.authority).toBe('HUMAN_CONFIRMED');
  });

  it('records the recommendation a confirmation settled, so a declined one stays visible', () => {
    const confirmed = confirmTaskPriority({ ...TASK }, {
      priority: 'LOW',
      confirmedBy: 'planner.rai',
      confirmedAt: '2026-01-15T09:00:00Z',
      recommendationId: 'AIR-TEST-1',
    });
    const resolved = resolveAuthoritativeTaskPriority(confirmed, [advice({ recommendedPriority: 'URGENT' })]);
    expect(resolved.recommendationId).toBe('AIR-TEST-1');
    expect(resolved.priority).toBe('LOW');
  });

  it('can be confirmed with no AI advice at all', () => {
    // Confirmation is a human act; it does not require the model to have spoken.
    const confirmed = confirmTaskPriority({ ...TASK }, {
      priority: 'MEDIUM',
      confirmedBy: 'planner.rai',
      confirmedAt: '2026-01-15T09:00:00Z',
    });
    expect(resolveAuthoritativeTaskPriority(confirmed).status).toBe('AUTHORITATIVE');
  });
});

describe('a confirmed priority uses Module 3 vocabulary and nothing else', () => {
  it('accepts every Module 3 priority level', () => {
    for (const priority of MODULE_3_TASK_PRIORITIES) {
      const confirmed = confirmTaskPriority({ ...TASK }, {
        priority,
        confirmedBy: 'planner.rai',
        confirmedAt: '2026-01-15T09:00:00Z',
      });
      expect(resolveAuthoritativeTaskPriority(confirmed).priority).toBe(priority);
    }
  });

  it('refuses Module 4 vocabulary rather than coercing it', () => {
    // `CRITICAL` is a Module 4 CriticalityLevel. Module 3 has no such value, and
    // Module 4 has no `URGENT`; collapsing either way would invent a commitment.
    expect(() =>
      confirmTaskPriority({ ...TASK }, {
        priority: 'CRITICAL' as unknown as OptimizerPriorityLevel,
        confirmedBy: 'planner.rai',
        confirmedAt: '2026-01-15T09:00:00Z',
      }),
    ).toThrow(/outside Module 3's vocabulary/);
  });

  it('refuses an out-of-vocabulary value already sitting on the task', () => {
    // Even a record that somehow carries one is not treated as authoritative.
    const resolved = resolveAuthoritativeTaskPriority(
      {
        ...TASK,
        priority: 'CRITICAL' as unknown as OptimizerPriorityLevel,
        priorityConfirmation: {
          state: 'CONFIRMED',
          authority: 'HUMAN_CONFIRMED',
          confirmedBy: 'planner.rai',
          confirmedAt: '2026-01-15T09:00:00Z',
        },
      },
      [],
    );
    expect(resolved.status).toBe('UNCONFIRMED');
    expect(resolved.priority).toBeUndefined();
  });

  it('refuses a confirmation with no named human and none with no time', () => {
    const base = { priority: 'HIGH', confirmedAt: '2026-01-15T09:00:00Z' } as const;
    expect(() =>
      confirmTaskPriority({ ...TASK }, { ...base, confirmedBy: '   ' }),
    ).toThrow(/no named human/);
    expect(() =>
      confirmTaskPriority({ ...TASK }, { priority: 'HIGH', confirmedBy: 'planner.rai', confirmedAt: '' }),
    ).toThrow(/no confirmation time/);
  });

  it('exposes the vocabulary guard it actually uses', () => {
    for (const level of MODULE_3_TASK_PRIORITIES) {
      expect(isModule3PriorityLevel(level)).toBe(true);
    }
    for (const notModule3 of ['CRITICAL', 'urgent', 'POSSESSIONAL', '', null, 3, undefined]) {
      expect(isModule3PriorityLevel(notModule3)).toBe(false);
    }
  });
});

describe('recommendation and authoritative priority are independent', () => {
  it('allows a confirmed priority that differs from the recommendation', () => {
    const confirmed = confirmTaskPriority({ ...TASK }, {
      priority: 'LOW',
      confirmedBy: 'planner.rai',
      confirmedAt: '2026-01-15T09:00:00Z',
    });
    const recommendation = advice({ recommendedPriority: 'URGENT', priorityScore: 0.99 });
    const resolved = resolveAuthoritativeTaskPriority(confirmed, [recommendation]);

    // The advice is still on the record and still disagrees; the decision stands.
    expect(resolved.priority).toBe('LOW');
    expect(resolved.status).toBe('AUTHORITATIVE');
    expect(resolved.recommendationId).toBe('AIR-TEST-1');
    expect(recommendation.recommendedPriority).toBe('URGENT');
  });

  it('joins advice by taskId and not by affectedTaskIds', () => {
    const byTaskId = advice();
    const onlyByList = advice({
      recommendationId: 'AIR-LIST-ONLY',
      taskId: undefined,
      affectedTaskIds: [TASK.taskId],
    });
    expect(findAdvisoryPriorityRecommendation(TASK, [onlyByList])).toBeUndefined();
    expect(findAdvisoryPriorityRecommendation(TASK, [byTaskId])?.recommendationId).toBe(
      'AIR-TEST-1',
    );
  });

  it('picks the highest advice by vocabulary, not by array order', () => {
    const low = advice({ recommendationId: 'AIR-LOW', recommendedPriority: 'LOW' });
    const urgent = advice({ recommendationId: 'AIR-URGENT', recommendedPriority: 'URGENT' });
    // Reversed input order must not change the answer.
    expect(findAdvisoryPriorityRecommendation(TASK, [low, urgent])?.recommendationId).toBe(
      'AIR-URGENT',
    );
    expect(findAdvisoryPriorityRecommendation(TASK, [urgent, low])?.recommendationId).toBe(
      'AIR-URGENT',
    );
  });

  it('breaks a tie on recommendationId so the choice is stable', () => {
    const a = advice({ recommendationId: 'AIR-A', recommendedPriority: 'HIGH' });
    const b = advice({ recommendationId: 'AIR-B', recommendedPriority: 'HIGH' });
    expect(findAdvisoryPriorityRecommendation(TASK, [a, b])?.recommendationId).toBe('AIR-A');
    expect(findAdvisoryPriorityRecommendation(TASK, [b, a])?.recommendationId).toBe('AIR-A');
  });
});

describe('purity and determinism', () => {
  it('does not mutate the task it was given', () => {
    const before = JSON.stringify(TASK);
    const confirmed = confirmTaskPriority(TASK, {
      priority: 'HIGH',
      confirmedBy: 'planner.rai',
      confirmedAt: '2026-01-15T09:00:00Z',
    });
    recordAdvisoryRecommendation(TASK, { recommendationId: 'AIR-TEST-1' });
    resolveAuthoritativeTaskPriority(TASK, [advice()]);
    expect(JSON.stringify(TASK)).toBe(before);
    // A new object, not the input.
    expect(confirmed).not.toBe(TASK);
  });

  it('does not mutate the recommendations it was given', () => {
    const recommendations = [advice()];
    const before = JSON.stringify(recommendations);
    resolveAuthoritativeTaskPriority(TASK, recommendations);
    findAdvisoryPriorityRecommendation(TASK, recommendations);
    expect(JSON.stringify(recommendations)).toBe(before);
  });

  it('returns identical results across repeated calls', () => {
    const recommendations = [advice(), advice({ recommendationId: 'AIR-B', recommendedPriority: 'LOW' })];
    const first = resolveAuthoritativeTaskPriority({ ...TASK }, recommendations);
    const second = resolveAuthoritativeTaskPriority({ ...TASK }, recommendations);
    expect(first).toEqual(second);

    const input = { priority: 'HIGH', confirmedBy: 'planner.rai', confirmedAt: '2026-01-15T09:00:00Z' } as const;
    expect(confirmTaskPriority({ ...TASK }, input)).toEqual(confirmTaskPriority({ ...TASK }, input));
  });
});
