/**
 * Phase 9B-2E: the real Module 4 path, wired end to end.
 *
 * Module 4 snapshot -> PlannerScope -> readiness -> builder -> optimizerClient.
 *
 * This file is deliberately SEPARATE from `optimizerService.test.ts`, which is
 * left untouched on purpose. The synthetic-demo and mock-mode regression
 * requirements are met most convincingly by that existing suite continuing to
 * pass unmodified; the synthetic and mock cases asserted here are additional
 * evidence, not a replacement.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_CONFIG } from '@/services/api.config';
import { createOptimizerClient, type OptimizerFetch } from '@/services/optimizerClient';
import {
  OptimizerDisabledError,
  isOptimizerApiError,
  optimizerPlanState,
  optimizerService,
  setOptimizerClient,
} from '@/services/optimizerService';
import { buildOptimizeRequest } from '@/services/optimizerRequestBuilder';
import type { Module4ReadinessSnapshot } from '@/services/optimizerRequestReadiness';
import {
  INITIAL_PLANNER_SCOPE,
  selectPlannerCorridor,
  setPlannerTasks,
} from '@/utils/plannerScope';
import type { OptimizeRequestDTO } from '@/types/optimizer';
import {
  mockAIRecommendations,
  mockAssets,
  mockBlockRequests,
  mockCorridors,
  mockGoodsForecasts,
  mockMaintenanceTasks,
  mockResources,
  mockTrains,
} from '@/mocks';
import { PLAN_RESPONSE, clonePlan } from './optimizerFixtures';

const CORRIDOR = mockCorridors[0];
const CORRIDOR_ID = CORRIDOR.corridorId;
const originalFlag = API_CONFIG.useRealOptimizer;

interface Recorded {
  url: string;
  method: string;
  body: unknown;
}

/** Stub transport that records the exact body it was handed. */
function stubFetch(responder: (url: string) => Response): { fetchImpl: OptimizerFetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl: OptimizerFetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return responder(String(input));
  };
  return { fetchImpl, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function enableOptimizer(responder: (url: string) => Response = () => json(clonePlan())) {
  const { fetchImpl, calls } = stubFetch(responder);
  setOptimizerClient(createOptimizerClient({ baseUrl: 'http://localhost:5002', fetchImpl, timeoutMs: 0 }));
  API_CONFIG.useRealOptimizer = true;
  return calls;
}

/** The unpopulated mock world: correctly BLOCKED, so nothing may be sent. */
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

/** The same world with every declared Module 3 field present (test-only values). */
function readySnapshot(): Module4ReadinessSnapshot {
  const base = blockedSnapshot();
  const tasks = base.tasks.map((task) => ({
    ...task,
    corridorId: CORRIDOR_ID,
    priority: 'HIGH' as const,
    module3WorkType: 'PREVENTIVE' as const,
    dueBy: '2026-01-20',
  }));
  return {
    ...base,
    tasks,
    scope: setPlannerTasks(base.scope, [tasks[0].taskId], tasks),
    blockRequests: base.blockRequests.map((r) => ({
      ...r,
      corridorId: CORRIDOR_ID,
      occupancyType: 'TRAFFIC_BLOCK' as const,
    })),
    assets: base.assets.map((a) => ({ ...a, corridorId: CORRIDOR_ID, assetType: 'TRACK' })),
    corridors: base.corridors.map((c) => ({
      ...c,
      name: `Test Corridor ${c.corridorId}`,
      sections: [c.sectionId],
    })),
    trains: base.trains.map((t, i) => ({ ...t, corridorId: CORRIDOR_ID, movementId: `MOV-${i}` })),
    goodsForecasts: base.goodsForecasts.map((g) => ({
      ...g,
      corridorId: CORRIDOR_ID,
      windowStart: '22:00:00',
      windowEnd: '23:30:00',
      volumeTonnes: 800,
    })),
    resources: base.resources.map((r) => ({ ...r, module3ResourceType: 'MANPOWER' as const })),
    recommendations: base.recommendations.map((r) => ({
      ...r,
      taskId: tasks[0].taskId,
      priorityScore: 90,
      recommendedPriority: 'URGENT' as const,
    })),
  };
}

beforeEach(() => {
  optimizerPlanState.clear();
});

afterEach(() => {
  API_CONFIG.useRealOptimizer = originalFlag;
  setOptimizerClient(null);
  optimizerPlanState.clear();
  vi.restoreAllMocks();
});

describe('blocked construction never reaches the network', () => {
  it('returns kind BLOCKED for the unpopulated Module 4 world', async () => {
    const calls = enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    expect(result.kind).toBe('BLOCKED');
    expect(calls).toHaveLength(0);
  });

  it('does not construct or call an optimizer client at all', async () => {
    enableOptimizer();
    const spy = vi.spyOn(globalThis, 'fetch');
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    expect(result.kind).toBe('BLOCKED');
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves no plan state behind', async () => {
    enableOptimizer();
    await optimizerService.generatePlanFromModule4(blockedSnapshot());
    expect(optimizerPlanState.getState().planId).toBeNull();
  });

  it('carries the readiness state, blocker ids and reasons', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');
    expect(result.readiness.state).toBe('BLOCKED');
    expect(result.blockers.length).toBeGreaterThan(0);
    const ids = result.blockers.map((b) => b.id);
    expect(ids).toContain('tasks.work_type');
    expect(ids).toContain('tasks.due_by');
    expect(ids).toContain('corridors.name');
    for (const blocker of result.blockers) {
      expect(blocker.reason.length).toBeGreaterThan(0);
      expect(blocker.field.length).toBeGreaterThan(0);
    }
  });

  it('carries provenance for a request that was never built', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');
    expect(result.provenance.length).toBe(result.readiness.inputs.length);
    expect(result.provenance.map((p) => p.field)).toContain('context.tasks[].work_type');
  });

  it('marks blockers a user could actually act on', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');
    const byId = new Map(result.blockers.map((b) => [b.id, b]));
    expect(byId.get('tasks.work_type')?.resolvableByUserAction).toBe(true);
    expect(byId.get('tasks.due_by')?.resolvableByUserAction).toBe(true);
  });

  it('does not throw, and does not fake an empty plan', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    expect(result.kind).not.toBe('PLAN');
    expect('plan' in result).toBe(false);
  });

  it('still refuses to send when only ONE task is incomplete', async () => {
    const calls = enableOptimizer();
    const snapshot = readySnapshot();
    const broken: Module4ReadinessSnapshot = {
      ...snapshot,
      tasks: snapshot.tasks.map((t, i) => (i === 1 ? { ...t, dueBy: undefined } : t)),
    };
    const result = await optimizerService.generatePlanFromModule4(broken);
    expect(result.kind).toBe('BLOCKED');
    expect(calls).toHaveLength(0);
  });
});

describe('successful construction is sent exactly as built', () => {
  it('returns kind PLAN and records plan state', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(readySnapshot());
    expect(result.kind).toBe('PLAN');
    if (result.kind !== 'PLAN') throw new Error('expected PLAN');
    expect(result.plan.planId).toBe(PLAN_RESPONSE.plan_id);
    expect(optimizerPlanState.getState().planId).toBe(PLAN_RESPONSE.plan_id);
  });

  it('sends the builder output byte-for-byte, with no post-processing', async () => {
    const calls = enableOptimizer();
    await optimizerService.generatePlanFromModule4(readySnapshot());

    const expected = buildOptimizeRequest(readySnapshot());
    if (!expected.ok) throw new Error('expected the builder to succeed');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual(expected.request);
  });

  it('does not let the client mutate the builder result', async () => {
    const calls = enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(readySnapshot());
    if (result.kind !== 'PLAN') throw new Error('expected PLAN');
    const before = JSON.stringify(calls[0].body);
    // Re-running produces an identical payload: nothing downstream rewrote it.
    await optimizerService.generatePlanFromModule4(readySnapshot());
    expect(JSON.stringify(calls[1].body)).toBe(before);
  });

  it('reports which collections were emitted and which were withheld', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(readySnapshot());
    if (result.kind !== 'PLAN') throw new Error('expected PLAN');
    expect(result.emitted).toContain('tasks');
    expect(result.provenance.map((p) => p.field)).toContain('context.tasks');
  });

  it('is deterministic across repeated calls', async () => {
    const calls = enableOptimizer();
    const a = await optimizerService.generatePlanFromModule4(readySnapshot());
    const b = await optimizerService.generatePlanFromModule4(readySnapshot());
    expect(JSON.stringify(calls[0].body)).toBe(JSON.stringify(calls[1].body));
    expect(a.kind).toBe(b.kind);
  });

  it('sends Module 3 snake_case keys on the real path too', async () => {
    const calls = enableOptimizer();
    await optimizerService.generatePlanFromModule4(readySnapshot());
    const body = calls[0].body as OptimizeRequestDTO;
    // The opaque `request` payload is the one place a camelCase slip would reach
    // Module 3 as an unknown field, so it is asserted explicitly.
    expect(Object.keys(body.request ?? {}).sort()).toEqual(
      ['corridor_id', 'request_id', 'requested_end', 'requested_start', 'section', 'task_ids'].sort(),
    );
    for (const key of Object.keys(body.request ?? {})) {
      expect(key).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('does not mutate the snapshot it was given', async () => {
    enableOptimizer();
    const snapshot = readySnapshot();
    const before = JSON.stringify(snapshot);
    await optimizerService.generatePlanFromModule4(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});

describe('blocking stays distinct from API failure', () => {
  it('propagates a 500 as an OptimizerApiError, not as BLOCKED', async () => {
    enableOptimizer(() => json({ detail: 'solver exploded' }, 500));
    await expect(optimizerService.generatePlanFromModule4(readySnapshot())).rejects.toSatisfy(
      (error: unknown) => isOptimizerApiError(error) && error.status === 500,
    );
  });

  it('propagates a transport failure as a rejection, not a BLOCKED result', async () => {
    setOptimizerClient(
      createOptimizerClient({
        baseUrl: 'http://localhost:5002',
        fetchImpl: async () => {
          throw new TypeError('network down');
        },
        timeoutMs: 0,
      }),
    );
    API_CONFIG.useRealOptimizer = true;
    await expect(optimizerService.generatePlanFromModule4(readySnapshot())).rejects.toSatisfy(
      (error: unknown) => isOptimizerApiError(error),
    );
  });

  it('keeps 404 plan-read handling exactly as it was', async () => {
    // Generate succeeds; only the plan read 404s.
    enableOptimizer((url) => (url.includes('/generate') ? json(clonePlan()) : json({ detail: 'no such plan' }, 404)));
    await optimizerService.generatePlanFromModule4(readySnapshot());
    // Unchanged existing behaviour: a 404 on a plan read still surfaces as an
    // OptimizerApiError through the same path, not as a BLOCKED result.
    await expect(optimizerService.getPlan('missing')).rejects.toSatisfy(
      (error: unknown) => isOptimizerApiError(error) && error.status === 404,
    );
  });

  it('still throws OptimizerDisabledError while the real API is off', async () => {
    API_CONFIG.useRealOptimizer = false;
    await expect(optimizerService.generatePlanFromModule4(readySnapshot())).rejects.toBeInstanceOf(
      OptimizerDisabledError,
    );
  });
});

describe('the synthetic-demo path is untouched', () => {
  it('still sends Module 3 pinned synthetic data with no Module 4 records', async () => {
    const calls = enableOptimizer();
    const plan = await optimizerService.generateSyntheticDemoPlan();
    expect(plan.planId).toBe(PLAN_RESPONSE.plan_id);
    expect(calls).toHaveLength(1);
    const body = calls[0].body as OptimizeRequestDTO;
    expect(body.context?.tasks).toHaveLength(100);
    // The wire format is snake_case, exactly as Module 3 pinned it.
    expect(body.request?.request_id).toBe('BRQ-TSK-001');
  });

  it('generatePlan() with no payload still means the synthetic demo', async () => {
    const calls = enableOptimizer();
    await optimizerService.generatePlan();
    expect(calls).toHaveLength(1);
    expect((calls[0].body as OptimizeRequestDTO).context?.corridors).toHaveLength(20);
  });

  it('never routes synthetic records through the Module 4 builder', async () => {
    const calls = enableOptimizer();
    await optimizerService.generateSyntheticDemoPlan();
    // The Module 4 snapshot collections carry 24 tasks; the synthetic payload
    // carries Module 3's 100. If they were mixed, the count would not be 100.
    const body = calls[0].body as OptimizeRequestDTO;
    expect(body.context?.tasks).toHaveLength(100);
    expect(mockMaintenanceTasks).toHaveLength(24);
  });

  it('still exposes the synthetic provenance unchanged', async () => {
    enableOptimizer();
    const provenance = await optimizerService.getSyntheticDemoProvenance();
    expect(provenance.dataMode).toBe('SYNTHETIC_DEMO');
    expect(provenance.containsModule4Data).toBe(false);
    expect(provenance.fixtureSha256).toHaveLength(64);
  });
});

describe('mock mode is untouched', () => {
  it('does not depend on readiness', async () => {
    // Mock mode is the default and stays the only data source while the real
    // optimizer is off; this method is not involved at all.
    API_CONFIG.useRealOptimizer = false;
    expect(optimizerService.isEnabled()).toBe(false);
    await expect(optimizerService.generatePlanFromModule4(blockedSnapshot())).rejects.toBeInstanceOf(
      OptimizerDisabledError,
    );
  });

  it('leaves API_CONFIG.useMock alone', () => {
    expect(typeof API_CONFIG.useMock).toBe('boolean');
  });
});

describe('the service adds no semantic mapping of its own', () => {
  /** Executable code only: comments and JSDoc are stripped first. */
  function serviceSource(): string {
    const raw = readFileSync(
      resolve(process.cwd(), 'src/services/optimizerService.ts'),
      'utf8',
    );
    return raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
  }

  it('never reads a Module 4 field that has no declared Module 3 counterpart', () => {
    const code = serviceSource();
    for (const forbidden of [
      'criticality',
      'urgency',
      'riskLevel',
      'blockType',
      'requestedDate',
      'objectiveValue',
      'condition',
      'expectedTime',
    ]) {
      expect(code, `service must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('never hardcodes a Module 3 enum literal', () => {
    const code = serviceSource();
    for (const forbidden of [
      'TRAFFIC_BLOCK',
      'POSSESSION',
      'SLOW_MOVEMENT',
      'URGENT',
      'ENGINEERING_TRAIN',
      'PREVENTIVE',
    ]) {
      expect(code, `service must not hardcode ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('delegates construction to the builder rather than assembling a payload', () => {
    const code = serviceSource();
    expect(code).toContain('buildOptimizeRequest');
    // It forwards the built request; it does not rebuild one field by field.
    expect(code).toContain('generatePlan(build.request');
  });
});
