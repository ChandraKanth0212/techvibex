/**
 * Tests for the real Module 3 request builder.
 *
 * The central claim under test is not that the builder produces a payload - it
 * is that it REFUSES to produce one until Module 4's data is genuinely complete.
 * A builder that quietly fills gaps is the failure mode this whole phase exists
 * to prevent, so the refusal paths get at least as much coverage as the success
 * path.
 */

import { describe, it, expect } from 'vitest';
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
import { buildOptimizeRequest } from '@/services/optimizerRequestBuilder';
import type { Module4ReadinessSnapshot } from '@/services/optimizerRequestReadiness';
import {
  INITIAL_PLANNER_SCOPE,
  selectPlannerCorridor,
  setPlannerTasks,
} from '@/utils/plannerScope';
import type { ExistingOccupancy } from '@/types/occupancy';
import { withDecisionsApplied } from './decidedWorldFixture';

const CORRIDOR = mockCorridors[0];
const CORRIDOR_ID = CORRIDOR.corridorId;

/** The unpopulated mock world, with a corridor and one task explicitly selected. */
function blockedSnapshot(): Module4ReadinessSnapshot {
  return {
    tasks: mockMaintenanceTasks,
    blockRequests: mockBlockRequests,
    assets: mockAssets,
    trains: mockTrains,
    goodsForecasts: mockGoodsForecasts,
    resources: mockResources,
    corridors: mockCorridors,
    integratedBlocks: [],
    occupancies: [],
    recommendations: mockAIRecommendations,
    scope: setPlannerTasks(
      selectPlannerCorridor(INITIAL_PLANNER_SCOPE, CORRIDOR_ID, mockCorridors),
      [mockMaintenanceTasks[0].taskId],
      mockMaintenanceTasks,
    ),
  };
}

/**
 * The same world with all five Phase 9B-8 decisions MADE, which is the only way
 * to reach the success path. Every value here is a test fixture standing in for
 * data Module 4 does not have yet - nothing is written into src/mocks.
 *
 * Phase 9B-8 changed what "complete" means, so this fixture changed with it:
 *   - a priority is authoritative only once a human CONFIRMED it;
 *   - a block request is a REQUEST, so the block requests still carry no
 *     occupancyType here and a granted possession is supplied instead;
 *   - a resource type needs an APPROVED MAPPING, not a value set on the record;
 *   - `sections` must be a survey, so it is not a restatement of sectionId.
 */
function readySnapshot(): Module4ReadinessSnapshot {
  const base = blockedSnapshot();
  const decided = withDecisionsApplied(base);
  const tasks = decided.tasks.map((task) => ({
    ...task,
    module3WorkType: 'PREVENTIVE' as const,
    dueBy: '2026-01-20',
  }));
  const scope = setPlannerTasks(base.scope, [tasks[0].taskId], tasks);
  return {
    ...decided,
    tasks,
    scope,
    blockRequests: base.blockRequests.map((r) => ({
      ...r,
      corridorId: CORRIDOR_ID,
      // Deliberately NOT an occupancyType: a request is not a grant. The
      // possession records supplied by withDecisionsApplied are what satisfy
      // `request.occupancy_type`.
    })),
    recommendations: base.recommendations.map((r) => ({
      ...r,
      taskId: tasks[0].taskId,
      priorityScore: 90,
      recommendedPriority: 'URGENT' as const,
    })),
  };
}

describe('the builder refuses rather than approximating', () => {
  it('refuses the unpopulated Module 4 world', () => {
    const result = buildOptimizeRequest(blockedSnapshot());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.summary).toContain('Refusing to build');
  });

  it('names blockers by readiness id so each is actionable', () => {
    const result = buildOptimizeRequest(blockedSnapshot());
    if (result.ok) throw new Error('expected a refusal');
    const ids = result.blockers.map((b) => b.id);
    expect(ids).toContain('resources.resource_type');
    // Phase 9B-5 supplied explicit corridor identity and corridor names.
    expect(ids).not.toContain('corridors.name');
    expect(ids).not.toContain('tasks.corridor_id');
    expect(ids).not.toContain('goods_forecasts.corridor_id');
    // Phase 9B-6 supplied the verified task and forecast fields.
    expect(ids).not.toContain('tasks.work_type');
    expect(ids).not.toContain('tasks.due_by');
    expect(ids).not.toContain('goods_forecasts.window');
    expect(ids).not.toContain('goods_forecasts.volume_tonnes');
    // A task and corridor ARE selected here, so task_ids is correctly satisfied.
    expect(ids).not.toContain('request.task_ids');
  });

  it('never emits a request object on the refusal path', () => {
    const result = buildOptimizeRequest(blockedSnapshot());
    expect('request' in result).toBe(false);
  });

  it('refuses when a single task still lacks an explicit field', () => {
    const snapshot = readySnapshot();
    const broken: Module4ReadinessSnapshot = {
      ...snapshot,
      tasks: snapshot.tasks.map((t, i) => (i === 1 ? { ...t, module3WorkType: undefined } : t)),
    };
    const result = buildOptimizeRequest(broken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.blockers.map((b) => b.id)).toContain('tasks.work_type');
  });

  it('refuses when no corridor is selected', () => {
    const snapshot: Module4ReadinessSnapshot = {
      ...readySnapshot(),
      scope: setPlannerTasks(INITIAL_PLANNER_SCOPE, [mockMaintenanceTasks[0].taskId], mockMaintenanceTasks),
    };
    const result = buildOptimizeRequest(snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    // Readiness catches the missing corridor before the builder's own guard does,
    // which is the intended order: the gate is the authority, not the builder.
    expect(result.blockers.map((b) => b.id)).toContain('request.corridor_id');
  });

  it('refuses when a selected task is absent from the snapshot', () => {
    const snapshot = readySnapshot();
    const result = buildOptimizeRequest({
      ...snapshot,
      scope: setPlannerTasks(snapshot.scope, ['TSK-9999'], snapshot.tasks),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.blockers.map((b) => b.id)).toContain('request.task_ids');
  });

  it('refuses when tasks would dangle because assets are unverified', () => {
    const snapshot = readySnapshot();
    const withoutAssets: Module4ReadinessSnapshot = {
      ...snapshot,
      assets: snapshot.assets.map((a) => ({ ...a, corridorId: undefined })),
    };
    const result = buildOptimizeRequest(withoutAssets);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.summary).toContain('referential integrity');
  });
});

describe('the builder emits only verified, in-scope records', () => {
  it('produces a request when every declared field is present', () => {
    const result = buildOptimizeRequest(readySnapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got: ${result.summary}`);
    expect(result.request.request?.corridor_id).toBe(CORRIDOR_ID);
    expect(result.request.context?.tasks).toHaveLength(1);
  });

  it('scopes the context to the selected corridor only', () => {
    const result = buildOptimizeRequest(readySnapshot());
    if (!result.ok) throw new Error('expected success');
    const corridors = result.request.context?.corridors as { corridor_id: string }[];
    expect(corridors).toHaveLength(1);
    expect(corridors[0].corridor_id).toBe(CORRIDOR_ID);
    const trains = result.request.context?.train_movements as { corridor_id: string }[];
    expect(trains.every((t) => t.corridor_id === CORRIDOR_ID)).toBe(true);
  });

  it('sends only the explicitly selected tasks', () => {
    const result = buildOptimizeRequest(readySnapshot());
    if (!result.ok) throw new Error('expected success');
    expect(result.request.request?.task_ids).toEqual([mockMaintenanceTasks[0].taskId]);
    const tasks = result.request.context?.tasks as { task_id: string }[];
    expect(tasks.map((t) => t.task_id)).toEqual([mockMaintenanceTasks[0].taskId]);
  });

  it('copies declared values verbatim under their Module 3 names', () => {
    const snapshot = readySnapshot();
    const result = buildOptimizeRequest(snapshot);
    if (!result.ok) throw new Error('expected success');
    const source = snapshot.tasks[0];
    const [task] = result.request.context?.tasks as Record<string, unknown>[];
    expect(task.task_id).toBe(source.taskId);
    expect(task.asset_id).toBe(source.assetId);
    expect(task.corridor_id).toBe(CORRIDOR_ID);
    expect(task.priority).toBe('HIGH');
    expect(task.work_type).toBe('PREVENTIVE');
    expect(task.due_by).toBe('2026-01-20');
    expect(task.estimated_duration_minutes).toBe(source.durationMinutes);
    expect(task.window_start).toBe(source.preferredStart);
  });

  it('omits fields Module 4 has no declared source for', () => {
    const result = buildOptimizeRequest(readySnapshot());
    if (!result.ok) throw new Error('expected success');
    const [task] = result.request.context?.tasks as Record<string, unknown>[];
    // Never derived from criticality / urgency / riskLevel.
    expect('criticality' in task).toBe(false);
    expect('urgency' in task).toBe(false);
    expect('riskLevel' in task).toBe(false);
    // No track-slot concept in Module 4; Module 3 defaults it.
    expect('required_track_slots' in task).toBe(false);
  });

  it('does not put IntegratedBlocks into existing_blocks', () => {
    // Phase 9B-8 Decision B: the granted possession records stay, because
    // emptying them now blocks the request for a second, unrelated reason
    // (`request.occupancy_type` is answered by the possession system alone).
    // The IntegratedBlocks are what this test is about, so they are added rather
    // than used to starve the snapshot.
    const result = buildOptimizeRequest({
      ...readySnapshot(),
      integratedBlocks: mockIntegratedBlocks,
    });
    if (!result.ok) throw new Error('expected success');
    const blocks = result.request.context?.existing_blocks as { block_id: string }[];
    // Every emitted block came from a granted possession, never a proposal.
    expect(blocks.map((b) => b.block_id)).not.toContain(mockIntegratedBlocks[0].blockId);
    for (const block of mockIntegratedBlocks) {
      expect(blocks.map((b) => b.block_id)).not.toContain(block.blockId);
    }
  });

  it('emits granted occupancy when it exists', () => {
    const occupancy: ExistingOccupancy = {
      occupancyId: 'OCC-001',
      corridorId: CORRIDOR_ID,
      section: CORRIDOR.sectionId,
      startTime: '2026-01-12T08:00:00Z',
      endTime: '2026-01-12T10:00:00Z',
      status: 'APPROVED',
      occupancyType: 'TRAFFIC_BLOCK',
      relatedTaskIds: [],
    };
    // Kept alongside the per-task possession records Decision B requires, since
    // this one names no task and therefore grants no request's occupancy type.
    const result = buildOptimizeRequest({
      ...readySnapshot(),
      occupancies: [...readySnapshot().occupancies, occupancy],
    });
    if (!result.ok) throw new Error('expected success');
    const blocks = result.request.context?.existing_blocks as Record<string, unknown>[];
    expect(blocks.map((b) => b.block_id)).toContain('OCC-001');
    const emitted = blocks.find((b) => b.block_id === 'OCC-001');
    expect(emitted?.status).toBe('APPROVED');
  });

  it('records provenance for what it emitted and what it withheld', () => {
    const result = buildOptimizeRequest(readySnapshot());
    if (!result.ok) throw new Error('expected success');
    const fields = result.provenance.map((p) => p.field);
    expect(fields).toContain('context.tasks');
    // defects have no verified mapping, so they are never emitted.
    expect(fields).toContain('context.defects');
    expect(result.request.context?.defects).toBeUndefined();
    const defects = result.provenance.find((p) => p.field === 'context.defects');
    expect(defects?.label).toBe('UNAVAILABLE_FROM_MODULE_4');
  });
});

describe('the builder is pure', () => {
  it('does not mutate the snapshot or the scope', () => {
    const snapshot = readySnapshot();
    const before = JSON.stringify(snapshot);
    buildOptimizeRequest(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('is deterministic across calls', () => {
    const snapshot = readySnapshot();
    const a = buildOptimizeRequest(snapshot);
    const b = buildOptimizeRequest(snapshot);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('returns a fresh object graph each call', () => {
    const snapshot = readySnapshot();
    const a = buildOptimizeRequest(snapshot);
    const b = buildOptimizeRequest(snapshot);
    if (!a.ok || !b.ok) throw new Error('expected success');
    expect(a.request).not.toBe(b.request);
    expect(a.request.context?.tasks).not.toBe(b.request.context?.tasks);
  });
});
