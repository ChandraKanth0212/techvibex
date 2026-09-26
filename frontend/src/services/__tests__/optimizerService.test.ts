import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_CONFIG } from '@/services/api.config';
import { createOptimizerClient, type OptimizerFetch } from '@/services/optimizerClient';
import {
  OptimizerDisabledError,
  OptimizerPlanUnavailableError,
  isOptimizerApiError,
  optimizerPlanState,
  optimizerService,
  setOptimizerClient,
} from '@/services/optimizerService';
import type { OptimizeRequestDTO } from '@/types/optimizer';
import { PLAN_RESPONSE, clonePlan } from './optimizerFixtures';

const GENERATE_PAYLOAD: OptimizeRequestDTO = { context: { tasks: [] } };

interface Recorded {
  url: string;
  method: string;
}

function stubFetch(responder: (url: string) => Response): { fetchImpl: OptimizerFetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl: OptimizerFetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return responder(String(input));
  };
  return { fetchImpl, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const originalFlag = API_CONFIG.useRealOptimizer;

function enableOptimizer(responder: (url: string) => Response) {
  const { fetchImpl, calls } = stubFetch(responder);
  setOptimizerClient(createOptimizerClient({ baseUrl: 'http://localhost:5002', fetchImpl, timeoutMs: 0 }));
  API_CONFIG.useRealOptimizer = true;
  return calls;
}

beforeEach(() => {
  optimizerPlanState.clear();
});

afterEach(() => {
  API_CONFIG.useRealOptimizer = originalFlag;
  setOptimizerClient(null);
  optimizerPlanState.clear();
});

describe('mock compatibility switch', () => {
  it('is opt-in: the real optimizer client is disabled by default', () => {
    expect(originalFlag).toBe(false);
    expect(optimizerService.isEnabled()).toBe(false);
  });

  it('throws OptimizerDisabledError while disabled and touches no network', async () => {
    await expect(optimizerService.generatePlan(GENERATE_PAYLOAD)).rejects.toBeInstanceOf(OptimizerDisabledError);
    await expect(optimizerService.getPlan()).rejects.toBeInstanceOf(OptimizerDisabledError);
    await expect(optimizerService.getPlanMetrics()).rejects.toBeInstanceOf(OptimizerDisabledError);
    await expect(optimizerService.getPlanConflicts()).rejects.toBeInstanceOf(OptimizerDisabledError);
    await expect(optimizerService.getCandidates({ context: {} })).rejects.toBeInstanceOf(OptimizerDisabledError);
    await expect(optimizerService.discoverIntegratedBlocks({ context: {} })).rejects.toBeInstanceOf(OptimizerDisabledError);
    await expect(optimizerService.validateSchedule({ schedule: clonePlan().schedule, context: {} })).rejects.toBeInstanceOf(
      OptimizerDisabledError,
    );
  });
});

describe('plan state', () => {
  it('starts empty', () => {
    expect(optimizerService.getPlanState()).toMatchObject({
      planId: null,
      availability: 'EMPTY',
      dataMode: null,
      storage: null,
    });
  });

  it('records plan_id, request_id, data_mode and storage after generatePlan()', async () => {
    enableOptimizer(() => json(PLAN_RESPONSE));

    const plan = await optimizerService.generatePlan(GENERATE_PAYLOAD);

    expect(plan.planId).toBe('PLAN-abc123');
    expect(optimizerService.getPlanState()).toMatchObject({
      planId: 'PLAN-abc123',
      requestId: 'REQ-0001',
      dataMode: 'SYNTHETIC_DEMO',
      storage: 'IN_MEMORY',
      availability: 'AVAILABLE',
      unavailableReason: null,
      lastKnownPlanId: 'PLAN-abc123',
    });
  });

  it('raises a typed error when a plan read is requested before any generate', async () => {
    enableOptimizer(() => json(PLAN_RESPONSE));

    await expect(optimizerService.getPlan()).rejects.toBeInstanceOf(OptimizerPlanUnavailableError);
    await expect(optimizerService.getPlanMetrics()).rejects.toBeInstanceOf(OptimizerPlanUnavailableError);
    await expect(optimizerService.getPlanConflicts()).rejects.toBeInstanceOf(OptimizerPlanUnavailableError);
  });

  it('reuses the stored plan id for plan, metrics and conflicts reads', async () => {
    const calls = enableOptimizer((url) => {
      if (url.endsWith('/metrics')) return json({ plan_id: 'PLAN-abc123', metrics: PLAN_RESPONSE.metrics });
      if (url.endsWith('/conflicts')) {
        return json({
          plan_id: 'PLAN-abc123',
          solver_status: 'OPTIMAL',
          validation_valid: false,
          error_count: 1,
          warning_count: 1,
          errors: [],
          warnings: [],
          rejected_candidate_count: 0,
          candidate_rejection_codes: {},
        });
      }
      return json(PLAN_RESPONSE);
    });

    await optimizerService.generatePlan(GENERATE_PAYLOAD);
    await optimizerService.getPlan();
    await optimizerService.getPlanMetrics();
    await optimizerService.getPlanConflicts();

    expect(calls.map((call) => call.url)).toEqual([
      'http://localhost:5002/api/optimizer/generate',
      'http://localhost:5002/api/optimizer/plans/PLAN-abc123',
      'http://localhost:5002/api/optimizer/plans/PLAN-abc123/metrics',
      'http://localhost:5002/api/optimizer/plans/PLAN-abc123/conflicts',
    ]);
  });

  it('accepts an explicit plan id without touching the stored one', async () => {
    const calls = enableOptimizer(() => json(PLAN_RESPONSE));

    await optimizerService.getPlan('PLAN-other');

    expect(calls[0].url).toBe('http://localhost:5002/api/optimizer/plans/PLAN-other');
    expect(optimizerService.getPlanState().planId).toBeNull();
  });

  it('drops a stored plan id after a 404 and explains that plans are in-memory', async () => {
    enableOptimizer(() =>
      json({ error: { code: 'NOT_FOUND', message: "plan 'PLAN-abc123' does not exist", details: {}, request_id: null } }, 404),
    );
    await optimizerService.generatePlan(GENERATE_PAYLOAD).catch(() => undefined);

    const state = optimizerPlanState;
    state.record({ planId: 'PLAN-abc123', requestId: 'REQ-0001', dataMode: 'SYNTHETIC_DEMO', storage: 'IN_MEMORY' });
    const error = await optimizerService.getPlan().catch((caught: unknown) => caught);

    expect(isOptimizerApiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe('NOT_FOUND');
    expect(optimizerService.getPlanState()).toMatchObject({
      planId: null,
      availability: 'UNAVAILABLE',
      lastKnownPlanId: 'PLAN-abc123',
    });
    expect(optimizerService.getPlanStateWarnings().join(' ')).toContain('do not survive a Module 3 restart');
    await expect(optimizerService.getPlan()).rejects.toBeInstanceOf(OptimizerPlanUnavailableError);
  });

  it('notifies subscribers and can be reset', async () => {
    enableOptimizer(() => json(PLAN_RESPONSE));
    const seen: Array<string | null> = [];
    const unsubscribe = optimizerPlanState.subscribe((state) => seen.push(state.planId));

    await optimizerService.generatePlan(GENERATE_PAYLOAD);
    optimizerService.resetPlanState();
    unsubscribe();

    expect(seen).toEqual(['PLAN-abc123', null]);
    expect(optimizerService.getPlanState().availability).toBe('EMPTY');
  });

  it('warns about an unexpected storage or data_mode envelope', () => {
    optimizerPlanState.record({ planId: 'P', requestId: 'R', dataMode: 'PRODUCTION', storage: 'DATABASE' });
    const warnings = optimizerService.getPlanStateWarnings().join(' ');

    expect(warnings).toContain('DATABASE');
    expect(warnings).toContain('PRODUCTION');
  });
});

describe('service returns mapped view models', () => {
  it('maps generate, plan, metrics, conflicts, candidates, discover and validate', async () => {
    enableOptimizer((url) => {
      if (url.endsWith('/api/optimizer/generate')) return json(PLAN_RESPONSE);
      if (url.endsWith('/metrics')) return json({ plan_id: 'PLAN-abc123', metrics: PLAN_RESPONSE.metrics });
      if (url.endsWith('/conflicts')) {
        return json({
          plan_id: 'PLAN-abc123',
          solver_status: 'OPTIMAL',
          validation_valid: false,
          error_count: 1,
          warning_count: 1,
          errors: PLAN_RESPONSE.validation!.errors,
          warnings: PLAN_RESPONSE.validation!.warnings,
          rejected_candidate_count: 1,
          candidate_rejection_codes: { TRAIN_MOVEMENT_CONFLICT: 1 },
        });
      }
      if (url.endsWith('/candidates')) {
        return json({
          task_ids: ['TASK-001'],
          candidate_count: 1,
          feasible_count: 1,
          rejected_count: 0,
          rejection_codes: {},
          candidates: PLAN_RESPONSE.candidates,
          data_mode: 'SYNTHETIC_DEMO',
          storage: 'IN_MEMORY',
        });
      }
      if (url.endsWith('/integrated-blocks/discover')) {
        return json({
          task_ids: ['TASK-001'],
          groups_examined: 1,
          compatible_count: 1,
          rejection_codes: {},
          candidates: PLAN_RESPONSE.integrated_candidates,
          data_mode: 'SYNTHETIC_DEMO',
          storage: 'IN_MEMORY',
        });
      }
      if (url.endsWith('/validate')) {
        return json({
          schedule_id: 'SCH-0001',
          solver_status: 'OPTIMAL',
          valid: true,
          error_count: 0,
          warning_count: 0,
          checked_block_count: 1,
          checked_task_count: 2,
          errors: [],
          warnings: [],
          metadata: {},
        });
      }
      return json(PLAN_RESPONSE);
    });

    const plan = await optimizerService.generatePlan(GENERATE_PAYLOAD);
    expect(plan.schedule.selectedBlocks[0].blockTypeResolution.uiBlockType).toBeNull();
    expect(plan.schedule.objectiveMapping.efficiencyScore).toBeNull();

    const stored = await optimizerService.getPlan();
    expect(stored.schedule.selectedBlocks[0].blockId).toBe('BLK-0001');

    const metrics = await optimizerService.getPlanMetrics();
    expect(metrics.metrics.totalTasksRequested).toBe(3);

    const conflicts = await optimizerService.getPlanConflicts();
    expect(conflicts.candidateRejectionCodes).toEqual({ TRAIN_MOVEMENT_CONFLICT: 1 });
    expect(conflicts.errors[0].severity).toBe('ERROR');

    const candidates = await optimizerService.getCandidates({ context: {} });
    expect(candidates.candidates[0].candidateId).toBe('CAND-0001');

    const discovered = await optimizerService.discoverIntegratedBlocks({ context: {} });
    expect(discovered.candidates[0].compatibility).toBe('COMPATIBLE');

    const validation = await optimizerService.validateSchedule({ schedule: clonePlan().schedule, context: {} });
    expect(validation.valid).toBe(true);
  });

  it('passes an AbortSignal through to the transport', async () => {
    const seen: Array<AbortSignal | null | undefined> = [];
    setOptimizerClient(
      createOptimizerClient({
        baseUrl: 'http://localhost:5002',
        timeoutMs: 0,
        fetchImpl: (_input, init) => {
          seen.push(init?.signal);
          return Promise.resolve(json(PLAN_RESPONSE));
        },
      }),
    );
    API_CONFIG.useRealOptimizer = true;
    const controller = new AbortController();

    await optimizerService.generatePlan(GENERATE_PAYLOAD, { signal: controller.signal });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });
});
