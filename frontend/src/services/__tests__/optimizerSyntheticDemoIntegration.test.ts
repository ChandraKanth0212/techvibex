import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_CONFIG } from '@/services/api.config';
import { createOptimizerClient, OPTIMIZER_ROUTES, type OptimizerFetch } from '@/services/optimizerClient';
import {
  OptimizerDisabledError,
  isOptimizerApiError,
  optimizerPlanState,
  optimizerService,
  setOptimizerClient,
} from '@/services/optimizerService';
import {
  SYNTHETIC_DEMO_DATA_MODE,
  SYNTHETIC_DEMO_STORAGE,
  buildSyntheticDemoOptimizeRequest,
} from '@/services/optimizerDemoRequest';
import type { OptimizeRequestDTO } from '@/types/optimizer';
import { PLAN_RESPONSE } from './optimizerFixtures';

type Dict = Record<string, unknown>;

interface Captured {
  url: string;
  method: string;
  body: Dict | null;
}

/**
 * Captures what actually went over the wire, so the assertions describe the real
 * request rather than the provider's intent.
 */
function captureTransport(responder: (url: string) => Response = () => jsonResponse(PLAN_RESPONSE)) {
  const calls: Captured[] = [];
  const fetchImpl: OptimizerFetch = async (input, init) => {
    const raw = typeof init?.body === 'string' ? init.body : null;
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: raw === null ? null : (JSON.parse(raw) as Dict),
    });
    return responder(String(input));
  };
  setOptimizerClient(createOptimizerClient({ baseUrl: 'http://localhost:5002', fetchImpl, timeoutMs: 0 }));
  API_CONFIG.useRealOptimizer = true;
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const originalFlag = API_CONFIG.useRealOptimizer;

beforeEach(() => {
  optimizerPlanState.clear();
});

afterEach(() => {
  API_CONFIG.useRealOptimizer = originalFlag;
  setOptimizerClient(null);
  optimizerPlanState.clear();
});

describe('synthetic demo request reaches the real optimizer API', () => {
  it('POSTs the vendored SYNTHETIC_DEMO body to /api/optimizer/generate', async () => {
    const calls = captureTransport();

    await optimizerService.generatePlan();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(`http://localhost:5002${OPTIMIZER_ROUTES.generate}`);

    const sent = calls[0].body as unknown as OptimizeRequestDTO;
    expect(Object.keys(sent!).sort()).toEqual(['context', 'request', 'settings']);
    expect(sent!.context).toBeDefined();
    expect(sent!.request).toBeDefined();
  });

  it('sends byte-identical payload content on the wire and in the provider', async () => {
    const calls = captureTransport();

    await optimizerService.generatePlan();

    expect(calls[0].body).toEqual(JSON.parse(JSON.stringify(buildSyntheticDemoOptimizeRequest())));
  });

  it('is reachable through the explicit generateSyntheticDemoPlan() alias', async () => {
    const calls = captureTransport();

    await optimizerService.generateSyntheticDemoPlan();

    expect(calls[0].url).toBe(`http://localhost:5002${OPTIMIZER_ROUTES.generate}`);
    expect(calls[0].body).toEqual(JSON.parse(JSON.stringify(buildSyntheticDemoOptimizeRequest())));
  });

  it('still honours an explicitly supplied payload instead of the demo one', async () => {
    const calls = captureTransport();
    const custom: OptimizeRequestDTO = { context: { tasks: [] }, request: { request_id: 'REQ-MANUAL' } };

    await optimizerService.generatePlan(custom);

    expect(calls[0].body).toEqual(JSON.parse(JSON.stringify(custom)));
  });

  it('does not mutate the vendored fixture across two real calls', async () => {
    const calls = captureTransport();

    await optimizerService.generatePlan();
    await optimizerService.generatePlan();

    expect(calls[0].body).toEqual(calls[1].body);
  });

  it('propagates an AbortSignal to the transport on the synthetic path', async () => {
    const seen: Array<AbortSignal | null | undefined> = [];
    setOptimizerClient(
      createOptimizerClient({
        baseUrl: 'http://localhost:5002',
        timeoutMs: 0,
        fetchImpl: (_input, init) => {
          seen.push(init?.signal);
          return Promise.resolve(jsonResponse(PLAN_RESPONSE));
        },
      }),
    );
    API_CONFIG.useRealOptimizer = true;
    const controller = new AbortController();

    await optimizerService.generatePlan(undefined, { signal: controller.signal });

    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });
});

describe('response envelope is captured verbatim', () => {
  it('preserves SYNTHETIC_DEMO and IN_MEMORY', async () => {
    captureTransport();

    const plan = await optimizerService.generatePlan();

    expect(plan.dataMode).toBe(SYNTHETIC_DEMO_DATA_MODE);
    expect(plan.storage).toBe(SYNTHETIC_DEMO_STORAGE);
    expect(optimizerService.getPlanState()).toMatchObject({
      dataMode: 'SYNTHETIC_DEMO',
      storage: 'IN_MEMORY',
    });
  });

  it('captures plan_id for the follow-up plan reads', async () => {
    captureTransport();

    const plan = await optimizerService.generatePlan();

    expect(plan.planId).toBe('PLAN-abc123');
    const state = optimizerService.getPlanState();
    expect(state.planId).toBe('PLAN-abc123');
    expect(state.requestId).toBe('REQ-0001');
    expect(state.availability).toBe('AVAILABLE');
  });

  it('captures solver_status without reinterpreting it', async () => {
    captureTransport();

    const plan = await optimizerService.generatePlan();

    expect(plan.solverStatus).toBe('OPTIMAL');
    expect(optimizerService.getPlanState().solverStatus).toBe('OPTIMAL');
  });

  it('captures schedule, unscheduled tasks, validation, metrics and explanations', async () => {
    captureTransport();

    const plan = await optimizerService.generatePlan();

    expect(plan.schedule.scheduleId).toBe('SCH-0001');
    expect(plan.schedule.status).toBe('OPTIMAL');
    expect(Array.isArray(plan.schedule.selectedBlocks)).toBe(true);
    expect(Array.isArray(plan.schedule.unscheduledTasks)).toBe(true);
    expect(plan.validation).not.toBeNull();
    expect(plan.validation?.solverStatus).toBe('OPTIMAL');
    expect(plan.metrics).not.toBeNull();
    expect(plan.metrics?.totalTasksRequested).toBe(3);
    expect(plan.explanations).not.toBeNull();
  });

  it('feeds the captured plan_id into the metrics read', async () => {
    const calls = captureTransport((url) => {
      if (url.endsWith('/metrics')) {
        return jsonResponse({ plan_id: 'PLAN-abc123', metrics: PLAN_RESPONSE.metrics });
      }
      return jsonResponse(PLAN_RESPONSE);
    });

    await optimizerService.generatePlan();
    await optimizerService.getPlanMetrics();

    expect(calls.map((call) => call.url)).toEqual([
      'http://localhost:5002/api/optimizer/generate',
      'http://localhost:5002/api/optimizer/plans/PLAN-abc123/metrics',
    ]);
  });

  it('surfaces the documented error envelope and drops an unusable plan id', async () => {
    captureTransport(() =>
      jsonResponse(
        { error: { code: 'REQUEST_VALIDATION', message: 'request body failed validation', details: {}, request_id: 'REQ-E' } },
        400,
      ),
    );

    const error = await optimizerService.generatePlan().catch((caught: unknown) => caught);

    expect(isOptimizerApiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe('REQUEST_VALIDATION');
    expect(optimizerService.getPlanState().planId).toBeNull();
  });
});

describe('unresolved mappings survive the synthetic round trip', () => {
  it('leaves block_type unmapped to a Module 4 BlockType', async () => {
    captureTransport();

    const plan = await optimizerService.generatePlan();
    const block = plan.schedule.selectedBlocks[0];

    expect(block.blockTypeResolution.uiBlockType).toBeNull();
    expect(block.blockTypeResolution.status).toBe('UNRESOLVED');
    expect(block.blockTypeResolution.reason).toBe('NO_PRODUCT_DECISION');
  });

  it('leaves objective_value unmapped to an efficiency score', async () => {
    captureTransport();

    const plan = await optimizerService.generatePlan();

    expect(plan.schedule.objectiveValue).toBe(PLAN_RESPONSE.schedule.objective_value);
    expect(plan.schedule.objectiveMapping.efficiencyScore).toBeNull();
    expect(plan.schedule.objectiveMapping.status).toBe('UNRESOLVED');
  });

  it('leaves violation severity unwidened into a Module 4 band', async () => {
    captureTransport();

    const plan = await optimizerService.generatePlan();
    const violation = plan.validation?.errors[0];

    expect(violation?.severity).toBe('ERROR');
    expect(violation?.severityMapping.uiSeverity).toBeNull();
    for (const band of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
      expect(violation?.severityMapping.uiSeverity).not.toBe(band);
    }
  });

  it('exposes provenance so the UI can label the result as synthetic', async () => {
    captureTransport();

    const provenance = await optimizerService.getSyntheticDemoProvenance();

    expect(provenance.dataMode).toBe('SYNTHETIC_DEMO');
    expect(provenance.containsModule4Data).toBe(false);
    expect(provenance.warnings.join(' ')).toContain('not real railway data');
  });
});

describe('mock mode is untouched by the synthetic integration', () => {
  it('keeps the real optimizer opt-in', () => {
    expect(originalFlag).toBe(false);
    expect(optimizerService.isEnabled()).toBe(false);
  });

  it('throws before any transport or fixture load while disabled', async () => {
    let fetchCalls = 0;
    setOptimizerClient(
      createOptimizerClient({
        baseUrl: 'http://localhost:5002',
        timeoutMs: 0,
        fetchImpl: () => {
          fetchCalls += 1;
          return Promise.resolve(jsonResponse(PLAN_RESPONSE));
        },
      }),
    );
    API_CONFIG.useRealOptimizer = false;

    await expect(optimizerService.generatePlan()).rejects.toBeInstanceOf(OptimizerDisabledError);
    await expect(optimizerService.generateSyntheticDemoPlan()).rejects.toBeInstanceOf(OptimizerDisabledError);
    await expect(optimizerService.getSyntheticDemoProvenance()).rejects.toBeInstanceOf(OptimizerDisabledError);

    expect(fetchCalls).toBe(0);
    expect(optimizerService.getPlanState().availability).toBe('EMPTY');
  });

  it('leaves the mock data switch alone', () => {
    // Module 4 mock services stay in charge whenever the optimizer is disabled.
    expect(API_CONFIG.useMock).toBe(true);
    expect(API_CONFIG.useRealOptimizer).toBe(false);
  });
});
