import { useCallback, useMemo, useState } from 'react';
import type { Corridor } from '@/types/corridor';
import {
  INITIAL_PLANNER_SCOPE,
  clearPlannerTasks,
  plannerScopeIdentity,
  plannerScopeTaskIds,
  selectPlannerCorridor,
  setPlannerHorizon,
  setPlannerTasks,
  togglePlannerTask,
  type PlannerHorizon,
  type PlannerScope,
  type TaskBearing,
} from '@/utils/plannerScope';

/**
 * Planner scope state for the Corridor Block Planner. Holds the planning
 * horizon, an explicitly selected Module 4 corridor, and an explicitly selected
 * set of tasks. Both selections are opt-in: nothing is selected on the operator's
 * behalf, and selecting a corridor never selects tasks.
 */
export function usePlannerScope(
  corridors: readonly Corridor[] = [],
  tasks: readonly TaskBearing[] = [],
) {
  const [scope, setScope] = useState<PlannerScope>(INITIAL_PLANNER_SCOPE);

  const setHorizon = useCallback((horizon: PlannerHorizon) => {
    setScope((prev) => setPlannerHorizon(prev, horizon));
  }, []);

  const selectCorridor = useCallback(
    (corridorId: string | null) => {
      setScope((prev) => selectPlannerCorridor(prev, corridorId, corridors));
    },
    [corridors],
  );

  const clearCorridor = useCallback(() => selectCorridor(null), [selectCorridor]);

  const selectTasks = useCallback(
    (taskIds: readonly string[]) => {
      setScope((prev) => setPlannerTasks(prev, taskIds, tasks));
    },
    [tasks],
  );

  const toggleTask = useCallback(
    (taskId: string) => {
      setScope((prev) => togglePlannerTask(prev, taskId, tasks));
    },
    [tasks],
  );

  const clearTasks = useCallback(() => {
    setScope((prev) => clearPlannerTasks(prev));
  }, []);

  const identity = useMemo(
    () => plannerScopeIdentity(scope, corridors),
    [scope, corridors],
  );

  const selectedTaskIds = useMemo(() => plannerScopeTaskIds(scope), [scope]);

  return {
    scope,
    setHorizon,
    selectCorridor,
    clearCorridor,
    identity,
    selectedTaskIds,
    selectTasks,
    toggleTask,
    clearTasks,
  };
}
