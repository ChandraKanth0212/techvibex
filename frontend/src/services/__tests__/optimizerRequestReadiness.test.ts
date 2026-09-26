import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
import { UNRESOLVED_OPTIMIZER_MAPPINGS, type OptimizerOccupancyType } from '@/types/optimizer';
import type { ExistingOccupancy } from '@/types/occupancy';
import {
  INITIAL_PLANNER_SCOPE,
  selectPlannerCorridor,
  setPlannerTasks,
  type PlannerScope,
} from '@/utils/plannerScope';
import {
  assessModule4Readiness,
  assessSyntheticDemoReadiness,
  deriveReadinessState,
  type Module4ReadinessSnapshot,
  type OptimizerReadinessInput,
  type OptimizerRequestReadiness,
} from '@/services/optimizerRequestReadiness';

const CORRIDOR_ID = mockCorridors[0].corridorId;

function snapshotWith(scope: PlannerScope = INITIAL_PLANNER_SCOPE): Module4ReadinessSnapshot {
  return {
    tasks: mockMaintenanceTasks,
    blockRequests: mockBlockRequests,
    assets: mockAssets,
    trains: mockTrains,
    goodsForecasts: mockGoodsForecasts,
    resources: mockResources,
    corridors: mockCorridors,
    integratedBlocks: mockIntegratedBlocks,
    occupancies: [],
    recommendations: mockAIRecommendations,
    scope,
  };
}

function inputOf(
  readiness: OptimizerRequestReadiness,
  id: string,
): OptimizerReadinessInput {
  const found = readiness.inputs.find((i) => i.id === id);
  if (!found) throw new Error(`no readiness input "${id}"`);
  return found;
}

function makeInput(
  overrides: Partial<OptimizerReadinessInput> = {},
): OptimizerReadinessInput {
  return {
    id: 'x',
    field: 'context.x',
    collection: 'x',
    requirement: 'x',
    status: 'AVAILABLE',
    source: 'MAPPED_FROM_MODULE_4',
    reason: '',
    synthetic: false,
    resolvableByUserAction: false,
    blocking: false,
    coverage: null,
    ...overrides,
  };
}

// ── Synthetic demo path ───────────────────────────────────────────────────────

describe('synthetic demo path is READY on explicit synthetic provenance', () => {
  const readiness = assessSyntheticDemoReadiness();

  it('is READY with no blocking inputs', () => {
    expect(readiness.state).toBe('READY');
    expect(readiness.blocking).toEqual([]);
    expect(readiness.dataMode).toBe('SYNTHETIC_DEMO');
  });

  it('marks every input AVAILABLE, synthetic, and sourced from Module 3', () => {
    expect(readiness.inputs.length).toBeGreaterThanOrEqual(20);
    for (const input of readiness.inputs) {
      expect(input.status).toBe('AVAILABLE');
      expect(input.synthetic).toBe(true);
      expect(input.source).toBe('MODULE_3_SYNTHETIC_DEMO');
      expect(input.reason).toContain('Not real railway data');
    }
  });

  it('claims no Module 4 provenance anywhere', () => {
    expect(
      readiness.inputs.filter((i) => i.source === 'MAPPED_FROM_MODULE_4'),
    ).toEqual([]);
    expect(
      readiness.inputs.filter((i) => i.source === 'UNAVAILABLE_FROM_MODULE_4'),
    ).toEqual([]);
  });

  it('warns that readiness describes demo data, not railway data', () => {
    expect(readiness.warnings).toContain(
      'READINESS_REFERS_TO_SYNTHETIC_DEMO: these inputs describe Module 3 demo data, not Module 4 railway data.',
    );
  });

  it('evaluates every input the task requires', () => {
    const ids = readiness.inputs.map((i) => i.id);
    for (const required of [
      'tasks.corridor_id',
      'block_requests.corridor_id',
      'assets.corridor_id',
      'trains.movement_id',
      'trains.corridor_id',
      'goods_forecasts.corridor_id',
      'goods_forecasts.window',
      'goods_forecasts.volume_tonnes',
      'resources.resource_type',
      'existing_blocks.approved_source',
      'priorities.task_id',
      'priorities.priority_score',
      'corridors.core_fields',
      'request.corridor_id',
    ]) {
      expect(ids).toContain(required);
    }
  });
});

// ── Module 4 assessment against real mock data ───────────────────────────────

describe('Module 4 data with no corridor selected', () => {
  const readiness = assessModule4Readiness(snapshotWith());

  it('is BLOCKED', () => {
    expect(readiness.state).toBe('BLOCKED');
    expect(readiness.dataMode).toBe('MODULE_4');
    expect(readiness.blocking.length).toBeGreaterThan(0);
  });

  it('reports the missing planner corridor as user-resolvable', () => {
    const input = inputOf(readiness, 'request.corridor_id');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(input.resolvableByUserAction).toBe(true);
    expect(readiness.scope.corridorId).toBeNull();
  });

  it('reports every entity corridor input as unavailable', () => {
    for (const id of [
      'tasks.corridor_id',
      'block_requests.corridor_id',
      'assets.corridor_id',
      'trains.corridor_id',
      'goods_forecasts.corridor_id',
    ]) {
      const input = inputOf(readiness, id);
      expect(input.status, id).toBe('UNAVAILABLE');
      expect(input.coverage?.present, id).toBe(0);
      expect(input.coverage?.total, id).toBeGreaterThan(0);
      expect(input.blocking, id).toBe(true);
    }
  });

  it('reports the missing movementId as an unpopulated domain field', () => {
    const input = inputOf(readiness, 'trains.movement_id');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.reason).toContain('movementId is populated on 0/');
    expect(input.reason).toContain('trainId');
    expect(input.coverage).toEqual({ present: 0, total: mockTrains.length });
    expect(input.resolvableByUserAction).toBe(false);
  });

  it('reports the unpopulated goods-forecast window pair', () => {
    const input = inputOf(readiness, 'goods_forecasts.window');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.reason).toContain('expectedTime');
    expect(input.reason).toContain('window_start');
    expect(input.coverage).toEqual({
      present: 0,
      total: mockGoodsForecasts.length,
    });
  });

  it('reports the unpopulated goods-forecast volume', () => {
    const input = inputOf(readiness, 'goods_forecasts.volume_tonnes');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.reason).toContain('volumeTonnes is populated on 0/');
    expect(input.reason).toContain('probability');
  });

  it('reports the resource enum mismatch as a mapping problem, not data', () => {
    const input = inputOf(readiness, 'resources.resource_type');
    expect(input.status).toBe('UNRESOLVED');
    expect(input.reason).toContain('ZERO overlapping values');
    expect(input.reason).toContain('MANPOWER');
    expect(input.reason).toContain('MAINTENANCE_CREW');
    expect(input.reason).toContain('never coerced');
    expect(input.resolvableByUserAction).toBe(false);
  });

  it('reports missing task priority as absent, never derived', () => {
    const input = inputOf(readiness, 'tasks.priority');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.reason).toContain('never computed from criticality, urgency or riskLevel');
    expect(input.coverage).toEqual({ present: 0, total: mockMaintenanceTasks.length });
  });

  it('keeps BlockType out of Module 3 occupancy_type', () => {
    const input = inputOf(readiness, 'request.occupancy_type');
    // No longer permanently UNRESOLVED: an explicit BlockRequest.occupancyType can
    // now satisfy it. It is still never derived from blockType.
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.coverage).toEqual({ present: 0, total: mockBlockRequests.length });
    expect(input.reason).toContain('never mapped');
    expect(input.reason).toContain('never inherited silently');
    expect(mockBlockRequests.every((r) => r.occupancyType === undefined)).toBe(true);
  });

  it('keeps requestedDate out of Module 3 due_by', () => {
    const input = inputOf(readiness, 'tasks.due_by');
    // due_by is no longer permanently UNRESOLVED: an explicit MaintenanceTask.dueBy
    // can now satisfy it. It is still never derived from requestedDate.
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.coverage).toEqual({ present: 0, total: mockMaintenanceTasks.length });
    expect(input.reason).toContain('DEADLINE');
    expect(input.reason).toContain('never derived');
    expect(mockMaintenanceTasks.every((t) => Boolean(t.requestedDate))).toBe(true);
    expect(mockMaintenanceTasks.every((t) => t.dueBy === undefined)).toBe(true);
  });

  it('reports work_type as a declared field rather than a free-text coercion', () => {
    const input = inputOf(readiness, 'tasks.work_type');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.coverage).toEqual({ present: 0, total: mockMaintenanceTasks.length });
    // Module 3 declares no default for work_type, so this one cannot be waived.
    expect(input.reason).toContain('NO default');
    expect(input.reason).toContain('never coerced');
  });

  it('reports the corridor name as a declared field rather than a station join', () => {
    const input = inputOf(readiness, 'corridors.name');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.coverage).toEqual({ present: 0, total: mockCorridors.length });
    expect(input.reason).toContain('never assembled from station names');
  });

  it('reports the unpopulated AI priority task id and score', () => {
    const taskId = inputOf(readiness, 'priorities.task_id');
    const score = inputOf(readiness, 'priorities.priority_score');
    const recommended = inputOf(readiness, 'priorities.recommended_priority');
    expect(taskId.status).toBe('UNAVAILABLE');
    expect(taskId.reason).toContain('affectedTaskIds');
    expect(taskId.coverage).toEqual({ present: 0, total: mockAIRecommendations.length });
    expect(score.status).toBe('UNAVAILABLE');
    expect(score.reason).toContain('priorityScore is populated on 0/');
    expect(recommended.status).toBe('UNAVAILABLE');
    expect(recommended.reason).toContain('recommendedPriority');
  });

  it('reports an empty planner task selection instead of assuming every task', () => {
    const input = inputOf(readiness, 'request.task_ids');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.reason).toContain('not widened to every maintenance task');
    expect(input.coverage).toEqual({ present: 0, total: 0 });
  });

  it('records the missing task window only when it is genuinely absent', () => {
    const input = inputOf(readiness, 'tasks.window');
    expect(input.status).toBe('AVAILABLE');
    expect(input.coverage).toEqual({
      present: mockMaintenanceTasks.length,
      total: mockMaintenanceTasks.length,
    });
  });

  it('records the unpopulated corridor section list', () => {
    const input = inputOf(readiness, 'corridors.sections');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.reason).toContain('single sectionId');
    expect(input.reason).toContain('never back-filled');
    expect(input.coverage).toEqual({ present: 0, total: mockCorridors.length });
  });

  it('accepts the corridor fields Module 4 does carry', () => {
    const input = inputOf(readiness, 'corridors.core_fields');
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
  });

  it('does not call the absent corridor physical fields available', () => {
    const input = inputOf(readiness, 'corridors.physical');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(input.synthetic).toBe(false);
    expect(input.reason).toContain('no name, gauge, electrified or max_speed_kmph');
  });

  it('never claims a value is available while saying its data is missing', () => {
    for (const input of readiness.inputs) {
      // An empty collection is satisfied by having no records, so it is
      // AVAILABLE with no Module 4 value behind it; its reason says so.
      const vacuouslySatisfied =
        input.coverage !== null &&
        input.coverage.total === 0 &&
        input.coverage.present === 0;
      if (vacuouslySatisfied) continue;

      expect(
        input.status === 'AVAILABLE' && input.source === 'UNAVAILABLE_FROM_MODULE_4',
        input.id,
      ).toBe(false);
      expect(
        input.status !== 'AVAILABLE' &&
          input.source === 'MAPPED_FROM_MODULE_4' &&
          !input.synthetic,
        input.id,
      ).toBe(false);
    }
  });

  it('keeps every availability verdict consistent with its own coverage', () => {
    for (const input of readiness.inputs) {
      if (input.coverage === null) continue;
      const { present, total } = input.coverage;
      if (total === 0) continue;
      const expected = present === total ? 'AVAILABLE' : present === 0 ? 'UNAVAILABLE' : 'PARTIAL';
      expect(
        ['UNAVAILABLE', 'UNRESOLVED', 'EXCLUDED'].includes(input.status) ||
          input.status === expected,
        `${input.id}: status ${input.status} vs coverage ${present}/${total}`,
      ).toBe(true);
    }
  });

  it('reports coherent provenance when the new fields ARE populated', () => {
    // The empty-mock snapshot cannot catch a source that contradicts a fully
    // covered collection, so the same invariants are checked on populated data.
    const populated = assessModule4Readiness({
      ...snapshotWith(),
      trains: mockTrains.map((t, i) => ({ ...t, movementId: `MVT-${i}` })),
      corridors: mockCorridors.map((c) => ({ ...c, sections: [c.sectionId] })),
      resources: mockResources.map((r) => ({ ...r, module3ResourceType: 'MANPOWER' as const })),
      tasks: mockMaintenanceTasks.map((t) => ({ ...t, priority: 'HIGH' as const })),
      recommendations: mockAIRecommendations.map((r) => ({
        ...r,
        taskId: 'TSK-001',
        priorityScore: 0.5,
        recommendedPriority: 'HIGH' as const,
      })),
      scope: setPlannerTasks(INITIAL_PLANNER_SCOPE, [mockMaintenanceTasks[0].taskId], mockMaintenanceTasks),
    });

    for (const input of populated.inputs) {
      const vacuouslySatisfied =
        input.coverage !== null && input.coverage.total === 0 && input.coverage.present === 0;
      if (vacuouslySatisfied) continue;
      expect(
        input.status === 'AVAILABLE' && input.source === 'UNAVAILABLE_FROM_MODULE_4',
        `${input.id} claims available with no Module 4 provenance`,
      ).toBe(false);
      expect(
        input.status !== 'AVAILABLE' &&
          input.source === 'MAPPED_FROM_MODULE_4' &&
          !input.synthetic,
        `${input.id} claims Module 4 provenance while unavailable`,
      ).toBe(false);
    }
  });

  it('maps provenance exactly when a collection becomes fully covered', () => {
    const populated = assessModule4Readiness({
      ...snapshotWith(),
      trains: mockTrains.map((t, i) => ({ ...t, movementId: `MVT-${i}` })),
    });
    const input = inputOf(populated, 'trains.movement_id');
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
  });
});

// ── Coverage is measured, not hardcoded ───────────────────────────────────────

describe('coverage is derived from the data, not asserted', () => {
  it('reports a window pair and volume when a forecast actually carries them', () => {
    const [first, ...rest] = mockGoodsForecasts;
    const enriched = [
      {
        ...first,
        windowStart: '22:00:00',
        windowEnd: '23:30:00',
        volumeTonnes: 800,
      },
      ...rest,
    ];
    const readiness = assessModule4Readiness({ ...snapshotWith(), goodsForecasts: enriched });

    const window = inputOf(readiness, 'goods_forecasts.window');
    expect(window.coverage).toEqual({ present: 1, total: enriched.length });
    expect(window.status).toBe('PARTIAL');
    expect(window.reason).not.toContain('is populated on 0/');

    const volume = inputOf(readiness, 'goods_forecasts.volume_tonnes');
    expect(volume.coverage).toEqual({ present: 1, total: enriched.length });
    expect(volume.status).toBe('PARTIAL');
  });

  it('reports a partial window pair that lacks only its end', () => {
    const [first, ...rest] = mockGoodsForecasts;
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      goodsForecasts: [{ ...first, windowStart: '22:00:00' }, ...rest],
    });
    const window = inputOf(readiness, 'goods_forecasts.window');
    expect(window.coverage).toEqual({ present: 0, total: rest.length + 1 });
    expect(window.status).toBe('UNAVAILABLE');
  });

  it('reports a priority score only when one is a finite number', () => {
    const [first, ...rest] = mockAIRecommendations;
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      recommendations: [{ ...first, priorityScore: 0.82 }, ...rest],
    });
    const score = inputOf(readiness, 'priorities.priority_score');
    expect(score.coverage).toEqual({ present: 1, total: rest.length + 1 });
    expect(score.status).toBe('PARTIAL');
  });

  it('rejects a non-numeric priority score rather than coercing it', () => {
    const [first, ...rest] = mockAIRecommendations;
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      recommendations: [{ ...first, priorityScore: Number.NaN }, ...rest],
    });
    expect(inputOf(readiness, 'priorities.priority_score').coverage).toEqual({
      present: 0,
      total: rest.length + 1,
    });
  });

  it('recognises an explicit movementId on every train', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      trains: mockTrains.map((t, i) => ({ ...t, movementId: `MVT-${i + 1}` })),
    });
    const input = inputOf(readiness, 'trains.movement_id');
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
    expect(input.coverage).toEqual({ present: mockTrains.length, total: mockTrains.length });
  });

  it('recognises a section list on every corridor', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      corridors: mockCorridors.map((c) => ({ ...c, sections: [c.sectionId, `${c.sectionId}-B`] })),
    });
    const input = inputOf(readiness, 'corridors.sections');
    expect(input.status).toBe('AVAILABLE');
    expect(input.coverage).toEqual({ present: mockCorridors.length, total: mockCorridors.length });
  });

  it('resolves the resource mapping only once every resource carries it explicitly', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      resources: mockResources.map((r) => ({ ...r, module3ResourceType: 'MANPOWER' as const })),
    });
    const input = inputOf(readiness, 'resources.resource_type');
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
    expect(input.coverage).toEqual({
      present: mockResources.length,
      total: mockResources.length,
    });
  });

  it('leaves the resource mapping unresolved while any resource lacks it', () => {
    const [first, ...rest] = mockResources;
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      resources: [{ ...first, module3ResourceType: 'MANPOWER' as const }, ...rest],
    });
    const input = inputOf(readiness, 'resources.resource_type');
    expect(input.status).toBe('UNRESOLVED');
    expect(input.coverage).toEqual({ present: 1, total: rest.length + 1 });
  });

  it('recognises explicit task priority and never derives it', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      tasks: mockMaintenanceTasks.map((t, i) => ({
        ...t,
        priority: (['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const)[i % 4],
      })),
    });
    const input = inputOf(readiness, 'tasks.priority');
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
    expect(input.coverage).toEqual({
      present: mockMaintenanceTasks.length,
      total: mockMaintenanceTasks.length,
    });
  });

  it('recognises explicit AI taskId, priorityScore and recommendedPriority', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      recommendations: mockAIRecommendations.map((r, i) => ({
        ...r,
        taskId: mockMaintenanceTasks[i].taskId,
        priorityScore: 0.5 + i / 100,
        recommendedPriority: 'HIGH' as const,
      })),
    });
    for (const id of [
      'priorities.task_id',
      'priorities.priority_score',
      'priorities.recommended_priority',
    ]) {
      const input = inputOf(readiness, id);
      expect(input.status, id).toBe('AVAILABLE');
      expect(input.source, id).toBe('MAPPED_FROM_MODULE_4');
      expect(input.coverage, id).toEqual({
        present: mockAIRecommendations.length,
        total: mockAIRecommendations.length,
      });
    }
  });

  it('honours an explicit task selection and rejects unknown ids', () => {
    const [first, second] = mockMaintenanceTasks;
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      scope: setPlannerTasks(INITIAL_PLANNER_SCOPE, [first.taskId, 'TSK-NOPE'], mockMaintenanceTasks),
    });
    const input = inputOf(readiness, 'request.task_ids');
    // The unknown id is dropped by the scope transition, so one real task remains.
    expect(input.status).toBe('AVAILABLE');
    expect(input.coverage).toEqual({ present: 1, total: 1 });
    expect(second.taskId).toBeDefined();
  });

  it('reports a partially valid task selection as PARTIAL', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      scope: {
        ...INITIAL_PLANNER_SCOPE,
        selectedTaskIds: [mockMaintenanceTasks[0].taskId, 'TSK-NOPE'],
      },
    });
    const input = inputOf(readiness, 'request.task_ids');
    expect(input.status).toBe('PARTIAL');
    expect(input.coverage).toEqual({ present: 1, total: 2 });
  });
});

// ── Proposed blocks must not become existing occupancy ────────────────────────

describe('proposed blocks never become existing occupancy', () => {
  const readiness = assessModule4Readiness(snapshotWith());

  it('excludes proposed blocks explicitly and names them', () => {
    const input = inputOf(readiness, 'existing_blocks.proposed_excluded');
    expect(input.status).toBe('EXCLUDED');
    const proposed = mockIntegratedBlocks.filter(
      (b) => b.status === 'AI_PROPOSED' || b.status === 'UNDER_REVIEW',
    );
    expect(proposed.length).toBeGreaterThan(0);
    for (const block of proposed) {
      expect(input.reason).toContain(block.blockId);
    }
  });

  it('reports no granted possession records at all', () => {
    const input = inputOf(readiness, 'existing_blocks.approved_source');
    expect(input.status).toBe('AVAILABLE');
    expect(input.coverage).toEqual({ present: 0, total: 0 });
    expect(input.reason).toContain('no possession source feeds it');
    expect(input.resolvableByUserAction).toBe(false);
  });

  it('rejects availableWindows as a substitute for a possession record', () => {
    const input = inputOf(readiness, 'existing_blocks.approved_source');
    expect(input.reason).toContain('Corridor.availableWindows is not a substitute');
    expect(input.reason).toContain('no occupancy type and no related task ids');
  });

  it('warns that proposed blocks remain proposals', () => {
    expect(readiness.warnings).toContain(
      'PROPOSED_BLOCKS_NOT_TREATED_AS_EXISTING_OCCUPANCY: proposed IntegratedBlocks remain proposals.',
    );
  });

  it('does not become BLOCKED on its own, because Module 3 accepts an empty list', () => {
    expect(inputOf(readiness, 'existing_blocks.approved_source').blocking).toBe(false);
  });
});

// ── PlannerScope corridor selection ───────────────────────────────────────────

describe('selecting a corridor scopes the request but assigns no entity', () => {
  const scope = selectPlannerCorridor(
    INITIAL_PLANNER_SCOPE,
    CORRIDOR_ID,
    mockCorridors,
  );
  const readiness = assessModule4Readiness(snapshotWith(scope));

  it('accepts the selected corridor as request scope', () => {
    const input = inputOf(readiness, 'request.corridor_id');
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
    expect(input.reason).toContain('scopes the request only');
    expect(readiness.scope.corridorId).toBe(CORRIDOR_ID);
    expect(readiness.scope.sectionId).toBe(mockCorridors[0].sectionId);
  });

  it('does NOT assign that corridor to any entity', () => {
    for (const id of [
      'tasks.corridor_id',
      'block_requests.corridor_id',
      'assets.corridor_id',
      'trains.corridor_id',
      'goods_forecasts.corridor_id',
    ]) {
      const input = inputOf(readiness, id);
      expect(input.status, id).toBe('UNAVAILABLE');
      expect(input.coverage?.present, id).toBe(0);
    }
  });

  it('remains BLOCKED overall', () => {
    expect(readiness.state).toBe('BLOCKED');
  });

  it('warns explicitly that scope does not assign entities', () => {
    expect(readiness.warnings).toContain(
      'PLANNER_SCOPE_CORRIDOR_DOES_NOT_ASSIGN_ENTITIES: the selected corridor scopes the request only. It was not applied to any task, block request, asset, train or forecast.',
    );
  });
});

// ── sectionId is never parsed ─────────────────────────────────────────────────

describe('sectionId alone is never mapped to a corridorId', () => {
  const readiness = assessModule4Readiness(snapshotWith());

  it('derives zero corridor coverage despite every record having a sectionId', () => {
    const withSections = [
      ...mockMaintenanceTasks,
      ...mockBlockRequests,
      ...mockAssets,
      ...mockTrains,
      ...mockGoodsForecasts,
    ];
    expect(withSections.every((r) => Boolean(r.sectionId))).toBe(true);
    for (const id of [
      'tasks.corridor_id',
      'block_requests.corridor_id',
      'assets.corridor_id',
      'trains.corridor_id',
      'goods_forecasts.corridor_id',
    ]) {
      expect(inputOf(readiness, id).coverage?.present, id).toBe(0);
    }
  });

  it('never labels a corridor input as mapped from Module 4', () => {
    for (const id of [
      'tasks.corridor_id',
      'block_requests.corridor_id',
      'assets.corridor_id',
      'trains.corridor_id',
      'goods_forecasts.corridor_id',
    ]) {
      const input = inputOf(readiness, id);
      expect(input.source, id).not.toBe('MAPPED_FROM_MODULE_4');
      expect(input.status, id).not.toBe('AVAILABLE');
    }
  });

  it('treats a Module 3 style section prefix as no corridor at all', async () => {
    const { resolveCorridorIdentity } = await import('@/utils/corridorIdentity');
    expect(
      resolveCorridorIdentity({ sectionId: 'COR-001-S1' }).corridorId,
    ).toBeNull();
  });

  it('contains no id-parsing operations in the module source', () => {
    const source = readFileSync(
      new URL('../optimizerRequestReadiness.ts', import.meta.url),
      'utf8',
    );
    const body = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*'))
      .join('\n');
    for (const forbidden of [
      '.split(',
      '.slice(',
      '.substring(',
      '.substr(',
      '.replace(',
      '.match(',
      'indexOf',
    ]) {
      expect(body, `readiness must not call ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ── Purity ────────────────────────────────────────────────────────────────────

describe('the assessment is pure and deterministic', () => {
  it('returns an identical result for identical input', () => {
    const a = assessModule4Readiness(snapshotWith());
    const b = assessModule4Readiness(snapshotWith());
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('orders inputs deterministically by id', () => {
    const ids = assessModule4Readiness(snapshotWith()).inputs.map((i) => i.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mutates no source object', () => {
    const snapshot = snapshotWith();
    const before = JSON.stringify(snapshot);
    assessModule4Readiness(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('makes no network call and imports no transport', () => {
    const source = readFileSync(
      new URL('../optimizerRequestReadiness.ts', import.meta.url),
      'utf8',
    );
    for (const forbidden of [
      'fetch(',
      'XMLHttpRequest',
      'axios',
      'optimizerClient',
      'optimizerService',
      'http://',
      'https://',
    ]) {
      expect(source, `readiness must not reference ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it('builds no request payload', () => {
    const source = readFileSync(
      new URL('../optimizerRequestReadiness.ts', import.meta.url),
      'utf8',
    );
    for (const forbidden of [
      'buildSyntheticDemoOptimizeRequest',
      'readSyntheticDemoFixture',
      'JSON.stringify(',
    ]) {
      expect(source, `readiness must not call ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});

// ── State machine ─────────────────────────────────────────────────────────────

describe('readiness state derivation', () => {
  it('is READY when every input is available', () => {
    expect(deriveReadinessState([makeInput(), makeInput()])).toBe('READY');
  });

  it('is PARTIALLY_READY when only non-blocking inputs are missing', () => {
    const inputs = [
      makeInput({ id: 'a' }),
      makeInput({
        id: 'b',
        status: 'UNAVAILABLE',
        blocking: false,
        source: 'UNAVAILABLE_FROM_MODULE_4',
      }),
    ];
    expect(deriveReadinessState(inputs)).toBe('PARTIALLY_READY');
  });

  it('is BLOCKED when any blocking input is missing', () => {
    for (const status of ['UNAVAILABLE', 'PARTIAL', 'UNRESOLVED', 'EXCLUDED'] as const) {
      const inputs = [
        makeInput({ id: 'a' }),
        makeInput({ id: 'b', status, blocking: true }),
      ];
      expect(deriveReadinessState(inputs), status).toBe('BLOCKED');
    }
  });
});

// ── Unresolved mappings stay unresolved ───────────────────────────────────────

describe('unresolved mappings are echoed, not resolved', () => {
  const readiness = assessModule4Readiness(snapshotWith());

  it('passes the registry through by reference', () => {
    expect(readiness.unresolvedMappings).toBe(UNRESOLVED_OPTIMIZER_MAPPINGS);
  });

  it('leaves every mapping in the UNRESOLVED state', () => {
    for (const mapping of readiness.unresolvedMappings) {
      expect(mapping.status, mapping.id).toBe('UNRESOLVED');
    }
  });

  it('still carries the mappings this phase must not touch', () => {
    const ids = readiness.unresolvedMappings.map((m) => m.id);
    for (const required of [
      'block_type',
      'objective_value',
      'criticality_to_priority',
      'requested_date_to_due_by',
      'confidence_to_score',
    ]) {
      expect(ids).toContain(required);
    }
  });

  it('records no objective-value to efficiency-score mapping', async () => {
    const { UNRESOLVED_OBJECTIVE_MAPPING } = await import('@/types/optimizer');
    expect(UNRESOLVED_OBJECTIVE_MAPPING.status).toBe('UNRESOLVED');
  });

  it('never maps objectiveValue to efficiencyScore inside the readiness module', () => {
    const source = readFileSync(
      new URL('../optimizerRequestReadiness.ts', import.meta.url),
      'utf8',
    );
    // Comments legitimately name the prohibition; only executable code is checked.
    const code = source
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('*') && !trimmed.startsWith('//');
      })
      .join('\n');
    for (const forbidden of ['objectiveValue', 'efficiencyScore', 'objective_value']) {
      expect(code, `readiness code must not mention ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ── Granted occupancy ─────────────────────────────────────────────────────────

const GRANTED_OCCUPANCY: ExistingOccupancy = {
  occupancyId: 'OCC-001',
  corridorId: mockCorridors[0].corridorId,
  section: mockCorridors[0].sectionId,
  startTime: '2026-01-12T08:00:00Z',
  endTime: '2026-01-12T10:00:00Z',
  status: 'APPROVED',
  occupancyType: 'TRAFFIC_BLOCK',
  relatedTaskIds: [mockMaintenanceTasks[0].taskId],
};

describe('only granted possession satisfies existing occupancy', () => {
  it('recognises a complete granted possession record', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      occupancies: [GRANTED_OCCUPANCY],
    });
    const input = inputOf(readiness, 'existing_blocks.approved_source');
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
    expect(input.coverage).toEqual({ present: 1, total: 1 });
  });

  it('rejects a merely planned possession as existing occupancy', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      occupancies: [{ ...GRANTED_OCCUPANCY, status: 'PLANNED' }],
    });
    const input = inputOf(readiness, 'existing_blocks.approved_source');
    expect(input.status).toBe('AVAILABLE');
    expect(input.coverage).toEqual({ present: 0, total: 0 });
    expect(input.reason).toContain('None of the 1 occupancy record(s) is granted');
    expect(input.reason).toContain('APPROVED or ACTIVE');
  });

  it('rejects a cancelled possession as existing occupancy', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      occupancies: [{ ...GRANTED_OCCUPANCY, status: 'CANCELLED' }],
    });
    expect(inputOf(readiness, 'existing_blocks.approved_source').coverage).toEqual({
      present: 0,
      total: 0,
    });
  });

  it('counts a granted record with missing fields as unusable', () => {
    const readiness = assessModule4Readiness({
      ...snapshotWith(),
      occupancies: [{ ...GRANTED_OCCUPANCY, occupancyType: '' as OptimizerOccupancyType }],
    });
    const input = inputOf(readiness, 'existing_blocks.approved_source');
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.coverage).toEqual({ present: 0, total: 1 });
  });

  it('does not let approved IntegratedBlocks stand in for possession', () => {
    const approvedBlocks = mockIntegratedBlocks.filter((b) =>
      ['APPROVED', 'PUBLISHED', 'COMPLETED'].includes(b.status),
    );
    expect(approvedBlocks.length).toBeGreaterThan(0);

    const readiness = assessModule4Readiness({ ...snapshotWith(), occupancies: [] });
    const input = inputOf(readiness, 'existing_blocks.approved_source');
    expect(input.coverage).toEqual({ present: 0, total: 0 });

    // The approved blocks are counted, and refused.
    const excluded = inputOf(readiness, 'existing_blocks.proposed_excluded');
    expect(excluded.status).toBe('EXCLUDED');
    expect(excluded.reason).toContain(`${approvedBlocks.length} approved/published block(s)`);
    expect(excluded.reason).toContain('None may be used as Module 3 existing_blocks');
    expect(excluded.reason).toContain('separate types');
  });

  it('never reports an IntegratedBlock count as occupancy coverage', () => {
    const readiness = assessModule4Readiness({ ...snapshotWith(), occupancies: [] });
    const occupancyInput = inputOf(readiness, 'existing_blocks.approved_source');
    const total =
      occupancyInput.coverage === null
        ? 0
        : occupancyInput.coverage.total;
    expect(total).toBe(0);
    expect(total).not.toBe(mockIntegratedBlocks.length);
  });
});

// ── Nothing is derived ────────────────────────────────────────────────────────

describe('no Module 4 axis is converted into a Module 3 one', () => {
  it('derives no task priority from criticality, urgency or risk', () => {
    const readiness = assessModule4Readiness(snapshotWith());
    // The mocks carry every criticality, urgency and risk value, and still none
    // of them becomes a Module 3 priority.
    expect(mockMaintenanceTasks.some((t) => t.criticality === 'CRITICAL')).toBe(true);
    expect(mockMaintenanceTasks.some((t) => t.urgency === 'HIGH')).toBe(true);
    const input = inputOf(readiness, 'tasks.priority');
    expect(input.coverage).toEqual({ present: 0, total: mockMaintenanceTasks.length });
    expect(input.reason).toContain('never computed from criticality, urgency or riskLevel');
  });

  it('leaves task priority unresolved-by-mapping in the registry', () => {
    const mapping = UNRESOLVED_OPTIMIZER_MAPPINGS.find(
      (m) => m.id === 'criticality_to_priority',
    );
    expect(mapping?.status).toBe('UNRESOLVED');
  });

  it('derives no resource type from the Module 4 resource vocabulary', () => {
    const readiness = assessModule4Readiness(snapshotWith());
    const input = inputOf(readiness, 'resources.resource_type');
    expect(input.coverage).toEqual({ present: 0, total: mockResources.length });
    expect(input.reason).toContain('never coerced');
  });

  it('derives no goods window from expectedTime and no tonnage from probability', () => {
    const readiness = assessModule4Readiness(snapshotWith());
    expect(mockGoodsForecasts.every((g) => Boolean(g.expectedTime))).toBe(true);
    expect(mockGoodsForecasts.every((g) => typeof g.probability === 'number')).toBe(true);
    expect(inputOf(readiness, 'goods_forecasts.window').coverage).toEqual({
      present: 0,
      total: mockGoodsForecasts.length,
    });
    expect(inputOf(readiness, 'goods_forecasts.volume_tonnes').coverage).toEqual({
      present: 0,
      total: mockGoodsForecasts.length,
    });
  });

  it('derives no corridor section list from sectionId', () => {
    const readiness = assessModule4Readiness(snapshotWith());
    expect(mockCorridors.every((c) => Boolean(c.sectionId))).toBe(true);
    expect(inputOf(readiness, 'corridors.sections').coverage).toEqual({
      present: 0,
      total: mockCorridors.length,
    });
  });

  it('derives no movementId from trainId', () => {
    const readiness = assessModule4Readiness(snapshotWith());
    expect(mockTrains.every((t) => Boolean(t.trainId))).toBe(true);
    expect(inputOf(readiness, 'trains.movement_id').coverage).toEqual({
      present: 0,
      total: mockTrains.length,
    });
  });
});

// ── Purity over the new fields ────────────────────────────────────────────────

describe('the new domain fields are treated as read-only input', () => {
  it('mutates no source record when new fields are present', () => {
    const snapshot: Module4ReadinessSnapshot = {
      ...snapshotWith(),
      occupancies: [GRANTED_OCCUPANCY],
      trains: mockTrains.map((t, i) => ({ ...t, movementId: `MVT-${i}` })),
      tasks: mockMaintenanceTasks.map((t) => ({ ...t, priority: 'HIGH' as const })),
    };
    const before = JSON.stringify(snapshot);
    assessModule4Readiness(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('does not write a derived value back onto a source record', () => {
    const [task] = mockMaintenanceTasks;
    const readiness = assessModule4Readiness(snapshotWith());
    expect(inputOf(readiness, 'tasks.priority').status).toBe('UNAVAILABLE');
    expect(task.priority).toBeUndefined();
    expect('priority' in task).toBe(false);
  });

  it('stays deterministic with the new collections populated', () => {
    const snapshot: Module4ReadinessSnapshot = {
      ...snapshotWith(),
      occupancies: [GRANTED_OCCUPANCY],
    };
    const a = assessModule4Readiness(snapshot);
    const b = assessModule4Readiness(snapshot);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── Empty collections ──────────────────────────────────────────────────────────

describe('empty collections are satisfiable, not blocking', () => {
  const readiness = assessModule4Readiness({
    ...snapshotWith(),
    tasks: [],
    blockRequests: [],
    goodsForecasts: [],
    trains: [],
  });

  it('marks corridor coverage AVAILABLE when there is nothing to satisfy', () => {
    const input = inputOf(readiness, 'goods_forecasts.corridor_id');
    expect(input.status).toBe('AVAILABLE');
    expect(input.coverage).toEqual({ present: 0, total: 0 });
    expect(input.reason).toContain('Collection is empty');
  });

  it('warns that there are no tasks in scope', () => {
    expect(readiness.warnings).toContain(
      'NO_TASKS_IN_SCOPE: Module 4 has no maintenance tasks to optimise.',
    );
  });
});
