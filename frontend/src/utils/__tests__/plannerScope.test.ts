import { describe, it, expect } from 'vitest';
import { mockCorridors, mockMaintenanceTasks } from '@/mocks';
import {
  INITIAL_PLANNER_SCOPE,
  clearPlannerTasks,
  findPlannerCorridor,
  plannerScopeIdentity,
  plannerScopeTaskIds,
  selectPlannerCorridor,
  setPlannerHorizon,
  setPlannerTasks,
  togglePlannerTask,
  toDetailEntries,
  type PlannerScope,
} from '@/utils/plannerScope';

const CORRIDOR_ID = mockCorridors[0].corridorId;
const SECTION_ID = mockCorridors[0].sectionId;
const TASKS = mockMaintenanceTasks;

describe('planner scope defaults', () => {
  it('starts on the weekly horizon with no corridor selected', () => {
    expect(INITIAL_PLANNER_SCOPE.horizon).toBe('WEEKLY');
    expect(INITIAL_PLANNER_SCOPE.selectedCorridorId).toBeNull();
  });

  it('reports the empty scope as unavailable rather than inventing a corridor', () => {
    const identity = plannerScopeIdentity(INITIAL_PLANNER_SCOPE, mockCorridors);
    expect(identity.corridorId).toBeNull();
    expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(identity.reason).toContain('No corridor selected');
  });
});

describe('planner horizon transitions', () => {
  it('switches horizon without disturbing the selected corridor', () => {
    const scoped: PlannerScope = { horizon: 'WEEKLY', selectedCorridorId: CORRIDOR_ID };
    const next = setPlannerHorizon(scoped, 'MONTHLY');
    expect(next.horizon).toBe('MONTHLY');
    expect(next.selectedCorridorId).toBe(CORRIDOR_ID);
  });

  it('returns the same reference when the horizon is unchanged', () => {
    const scoped: PlannerScope = { horizon: 'WEEKLY', selectedCorridorId: null };
    expect(setPlannerHorizon(scoped, 'WEEKLY')).toBe(scoped);
  });

  it('does not mutate the previous scope object', () => {
    const scoped: PlannerScope = { horizon: 'WEEKLY', selectedCorridorId: null };
    setPlannerHorizon(scoped, 'MONTHLY');
    expect(scoped.horizon).toBe('WEEKLY');
  });
});

describe('explicit corridor selection', () => {
  it('accepts a corridor present in the Module 4 register', () => {
    const next = selectPlannerCorridor(INITIAL_PLANNER_SCOPE, CORRIDOR_ID, mockCorridors);
    expect(next.selectedCorridorId).toBe(CORRIDOR_ID);
  });

  it('resolves the selected corridor to its declared section', () => {
    const scoped = selectPlannerCorridor(INITIAL_PLANNER_SCOPE, CORRIDOR_ID, mockCorridors);
    const identity = plannerScopeIdentity(scoped, mockCorridors);
    expect(identity.corridorId).toBe(CORRIDOR_ID);
    expect(identity.sectionId).toBe(SECTION_ID);
    expect(identity.source).toBe('MAPPED_FROM_MODULE_4');
  });

  it('rejects a corridor that does not exist in the register', () => {
    const next = selectPlannerCorridor(INITIAL_PLANNER_SCOPE, 'CORR-999', mockCorridors);
    expect(next.selectedCorridorId).toBeNull();
  });

  it('clears the scope for a blank or null selection', () => {
    const scoped = selectPlannerCorridor(INITIAL_PLANNER_SCOPE, CORRIDOR_ID, mockCorridors);
    expect(selectPlannerCorridor(scoped, null, mockCorridors).selectedCorridorId).toBeNull();
    expect(selectPlannerCorridor(scoped, '   ', mockCorridors).selectedCorridorId).toBeNull();
  });

  it('trims a padded selection before storing it', () => {
    const next = selectPlannerCorridor(INITIAL_PLANNER_SCOPE, `  ${CORRIDOR_ID}  `, mockCorridors);
    expect(next.selectedCorridorId).toBe(CORRIDOR_ID);
  });

  it('never fabricates a corridor when no register is supplied', () => {
    const next = selectPlannerCorridor(INITIAL_PLANNER_SCOPE, 'CORR-999');
    expect(next.selectedCorridorId).toBe('CORR-999');
    const identity = plannerScopeIdentity(next, mockCorridors);
    expect(identity.corridorId).toBe('CORR-999');
    expect(identity.source).toBe('MAPPED_FROM_MODULE_4');
    expect(identity.reason).toContain('not present in the Module 4 corridor register');
  });

  it('finds the matching corridor record', () => {
    expect(findPlannerCorridor(mockCorridors, CORRIDOR_ID)?.sectionId).toBe(SECTION_ID);
    expect(findPlannerCorridor(mockCorridors, null)).toBeUndefined();
    expect(findPlannerCorridor(mockCorridors, 'CORR-404')).toBeUndefined();
  });
});

// ── Explicit task selection ───────────────────────────────────────────────────

describe('explicit task selection', () => {
  it('starts with no tasks selected', () => {
    expect(plannerScopeTaskIds(INITIAL_PLANNER_SCOPE)).toEqual([]);
  });

  it('never widens an empty selection to every task', () => {
    const empty = setPlannerTasks(INITIAL_PLANNER_SCOPE, [], TASKS);
    expect(plannerScopeTaskIds(empty)).toEqual([]);
    expect(plannerScopeTaskIds(empty)).not.toEqual(TASKS.map((t) => t.taskId));
    // A scope object that simply omits the field means the same thing.
    const omitted: PlannerScope = { horizon: 'WEEKLY', selectedCorridorId: null };
    expect(plannerScopeTaskIds(omitted)).toEqual([]);
  });

  it('selects only the tasks it is given', () => {
    const [first, second] = TASKS;
    const scope = setPlannerTasks(INITIAL_PLANNER_SCOPE, [first.taskId, second.taskId], TASKS);
    expect(plannerScopeTaskIds(scope)).toEqual([first.taskId, second.taskId]);
  });

  it('rejects task ids that name no Module 4 task', () => {
    const scope = setPlannerTasks(INITIAL_PLANNER_SCOPE, ['TSK-9999'], TASKS);
    expect(plannerScopeTaskIds(scope)).toEqual([]);
  });

  it('drops unknown ids while keeping the real ones', () => {
    const [first] = TASKS;
    const scope = setPlannerTasks(
      INITIAL_PLANNER_SCOPE,
      [first.taskId, 'TSK-9999'],
      TASKS,
    );
    expect(plannerScopeTaskIds(scope)).toEqual([first.taskId]);
  });

  it('trims, blanks out and de-duplicates a selection', () => {
    const [first, second] = TASKS;
    const scope = setPlannerTasks(
      INITIAL_PLANNER_SCOPE,
      [` ${first.taskId} `, '', '   ', first.taskId, second.taskId],
      TASKS,
    );
    expect(plannerScopeTaskIds(scope)).toEqual([first.taskId, second.taskId]);
  });

  it('does not select tasks when a corridor is selected', () => {
    const scope = selectPlannerCorridor(INITIAL_PLANNER_SCOPE, CORRIDOR_ID, mockCorridors);
    expect(scope.selectedCorridorId).toBe(CORRIDOR_ID);
    expect(plannerScopeTaskIds(scope)).toEqual([]);
  });

  it('does not clear tasks when the corridor changes', () => {
    const [first] = TASKS;
    const withTask = setPlannerTasks(INITIAL_PLANNER_SCOPE, [first.taskId], TASKS);
    const rescoped = selectPlannerCorridor(withTask, CORRIDOR_ID, mockCorridors);
    expect(plannerScopeTaskIds(rescoped)).toEqual([first.taskId]);
    expect(clearPlannerTasks(rescoped).selectedCorridorId).toBe(CORRIDOR_ID);
  });

  it('toggles a single task in and out', () => {
    const [first] = TASKS;
    const added = togglePlannerTask(INITIAL_PLANNER_SCOPE, first.taskId, TASKS);
    expect(plannerScopeTaskIds(added)).toEqual([first.taskId]);
    expect(plannerScopeTaskIds(togglePlannerTask(added, first.taskId, TASKS))).toEqual([]);
  });

  it('clears the selection without touching horizon or corridor', () => {
    const [first] = TASKS;
    const scoped = setPlannerTasks(
      selectPlannerCorridor(setPlannerHorizon(INITIAL_PLANNER_SCOPE, 'MONTHLY'), CORRIDOR_ID, mockCorridors),
      [first.taskId],
      TASKS,
    );
    const cleared = clearPlannerTasks(scoped);
    expect(plannerScopeTaskIds(cleared)).toEqual([]);
    expect(cleared.horizon).toBe('MONTHLY');
    expect(cleared.selectedCorridorId).toBe(CORRIDOR_ID);
  });

  it('returns the same reference when the selection is unchanged', () => {
    const [first] = TASKS;
    const scope = setPlannerTasks(INITIAL_PLANNER_SCOPE, [first.taskId], TASKS);
    expect(setPlannerTasks(scope, [first.taskId], TASKS)).toBe(scope);
    expect(clearPlannerTasks(INITIAL_PLANNER_SCOPE)).toBe(INITIAL_PLANNER_SCOPE);
  });

  it('does not mutate the previous scope object', () => {
    const [first] = TASKS;
    const scope = setPlannerTasks(INITIAL_PLANNER_SCOPE, [first.taskId], TASKS);
    togglePlannerTask(scope, TASKS[1].taskId, TASKS);
    clearPlannerTasks(scope);
    expect(plannerScopeTaskIds(scope)).toEqual([first.taskId]);
  });
});

describe('planner detail projection', () => {  it('keeps scalar fields and drops nested ones', () => {
    const entries = toDetailEntries({
      taskId: 'TSK-001',
      corridorId: CORRIDOR_ID,
      durationMinutes: 90,
      requiredResources: ['RES-1'],
    });
    expect(entries).toEqual([
      ['taskId', 'TSK-001'],
      ['corridorId', CORRIDOR_ID],
      ['durationMinutes', 90],
    ]);
  });

  it('returns no rows for non-objects', () => {
    expect(toDetailEntries(null)).toEqual([]);
    expect(toDetailEntries(undefined)).toEqual([]);
    expect(toDetailEntries('corridorId')).toEqual([]);
  });
});
