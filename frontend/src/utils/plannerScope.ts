/**
 * RailOpt Module 4 – Planner Scope State (Phase 9B-2A)
 *
 * Pure planner scope transitions. A corridor can only enter the scope through
 * an explicit operator selection of a Module 4 `Corridor` record; it is never
 * inferred from the entities or section ids that happen to be displayed.
 */

import type { Corridor } from '@/types/corridor';
import type { CorridorIdentity } from '@/types/corridorIdentity';
import { explicitCorridorSelection } from './corridorIdentity';

export type PlannerHorizon = 'WEEKLY' | 'MONTHLY';

export interface PlannerScope {
  horizon: PlannerHorizon;
  selectedCorridorId: string | null;
  /**
   * Tasks the operator has explicitly put in scope.
   *
   * Absent or empty means NO tasks are selected — never "all of them". There is
   * deliberately no default that widens an empty selection to the whole
   * maintenance backlog, and no rule that selects tasks because their corridor
   * matches the selected one: a corridor scopes the *request*, while this list
   * scopes the *work*, and only a person can decide what goes into a plan.
   */
  selectedTaskIds?: readonly string[];
}

export const INITIAL_PLANNER_SCOPE: PlannerScope = {
  horizon: 'WEEKLY',
  selectedCorridorId: null,
  selectedTaskIds: [],
};

export function setPlannerHorizon(
  scope: PlannerScope,
  horizon: PlannerHorizon,
): PlannerScope {
  if (scope.horizon === horizon) return scope;
  return { ...scope, horizon };
}

/**
 * Applies a corridor selection. A blank selection clears the scope; a selection
 * that is absent from the supplied corridor register is rejected, because the
 * planner cannot scope to a corridor that does not exist in Module 4.
 */
export function selectPlannerCorridor(
  scope: PlannerScope,
  corridorId: string | null,
  corridors: readonly Corridor[] = [],
): PlannerScope {
  if (corridorId === null) {
    return scope.selectedCorridorId === null
      ? scope
      : { ...scope, selectedCorridorId: null };
  }

  const requested = corridorId.trim();
  if (requested.length === 0) {
    return scope.selectedCorridorId === null
      ? scope
      : { ...scope, selectedCorridorId: null };
  }

  if (corridors.length > 0) {
    const known = corridors.some((c) => c.corridorId === requested);
    if (!known) return { ...scope, selectedCorridorId: null };
  }

  if (scope.selectedCorridorId === requested) return scope;
  return { ...scope, selectedCorridorId: requested };
}

export function findPlannerCorridor(
  corridors: readonly Corridor[],
  corridorId: string | null,
): Corridor | undefined {
  if (!corridorId) return undefined;
  return corridors.find((c) => c.corridorId === corridorId);
}

/** Minimal shape a task selection is validated against. */
export interface TaskBearing {
  taskId: string;
}

/**
 * The explicitly selected task ids. An absent list and an empty list both mean
 * "nothing selected"; neither is ever widened to every task.
 */
export function plannerScopeTaskIds(scope: PlannerScope): readonly string[] {
  return scope.selectedTaskIds ?? [];
}

/**
 * Normalises a requested selection: trims, drops blanks, removes duplicates and
 * (when a task register is supplied) discards ids that name no known task.
 * Order of first appearance is preserved so the result is deterministic.
 */
function normalizeTaskIds(
  requested: readonly string[],
  tasks: readonly TaskBearing[],
): string[] {
  const known = tasks.length > 0 ? new Set(tasks.map((t) => t.taskId)) : null;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of requested) {
    if (typeof raw !== 'string') continue;
    const taskId = raw.trim();
    if (taskId.length === 0) continue;
    if (known && !known.has(taskId)) continue;
    if (seen.has(taskId)) continue;
    seen.add(taskId);
    result.push(taskId);
  }

  return result;
}

function sameTaskIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Replaces the task selection with an explicit list. Passing an empty list
 * clears the selection; it never means "every task".
 */
export function setPlannerTasks(
  scope: PlannerScope,
  taskIds: readonly string[],
  tasks: readonly TaskBearing[] = [],
): PlannerScope {
  const next = normalizeTaskIds(taskIds, tasks);
  if (sameTaskIds(plannerScopeTaskIds(scope), next)) return scope;
  return { ...scope, selectedTaskIds: next };
}

/** Adds or removes one task from the selection. */
export function togglePlannerTask(
  scope: PlannerScope,
  taskId: string,
  tasks: readonly TaskBearing[] = [],
): PlannerScope {
  const current = plannerScopeTaskIds(scope);
  const requested = current.includes(taskId)
    ? current.filter((id) => id !== taskId)
    : [...current, taskId];
  return setPlannerTasks(scope, requested, tasks);
}

/** Empties the task selection, leaving the corridor and horizon untouched. */
export function clearPlannerTasks(scope: PlannerScope): PlannerScope {
  return setPlannerTasks(scope, []);
}

/** Corridor provenance for the current planner scope. */
export function plannerScopeIdentity(
  scope: PlannerScope,
  corridors: readonly Corridor[] = [],
): CorridorIdentity {
  return explicitCorridorSelection(
    scope.selectedCorridorId,
    findPlannerCorridor(corridors, scope.selectedCorridorId),
  );
}

/**
 * Projects a selected domain entity into the scalar key/value rows rendered by
 * the planner detail modal. Nested values (arrays, objects) are omitted, so
 * scalar fields such as `corridorId` survive the projection intact.
 */
export function toDetailEntries(details: unknown): [string, unknown][] {
  if (details === null || typeof details !== 'object') return [];
  return Object.entries(details as Record<string, unknown>).filter(
    ([, value]) => typeof value !== 'object',
  );
}

