import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OPTIMIZER_BASE_URL,
  OptimizerApiError,
  createOptimizerClient,
  isOptimizerAbortError,
  isOptimizerApiError,
  type OptimizerFetch,
} from '@/services/optimizerClient';
import type {
  CandidatesRequestDTO,
  DiscoverRequestDTO,
  OptimizeRequestDTO,
  ValidateRequestDTO,
} from '@/types/optimizer';
import { PLAN_RESPONSE, clonePlan } from './optimizerFixtures';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function makeAbortError(): Error {
  const abortError = new Error('aborted');
  abortError.name = 'AbortError';
  return abortError;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(
  responder: (call: RecordedCall) => Response | Promise<Response>,
): { fetchImpl: OptimizerFetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: OptimizerFetch = async (input, init) => {
    const rawBody = typeof init?.body === 'string' ? JSON.parse(init?.body) : undefined;
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      body: rawBody,
    };
    calls.push(call);
    return responder(call);
  };
  return { fetchImpl, calls };
}

function makeClient(responder: (call: RecordedCall) => Response | Promise<Response>, overrides = {}) {
  const { fetchImpl, calls } = stubFetch(responder);
  const client = createOptimizerClient({
    baseUrl: DEFAULT_OPTIMIZER_BASE_URL,
    fetchImpl,
    requestIdFactory: () => 'req-generated-1',
    timeoutMs: 0,
    ...overrides,
  });
  return { client, calls };
}

const GENERATE_PAYLOAD: OptimizeRequestDTO = { context: { tasks: [] } };
const VALIDATE_PAYLOAD: ValidateRequestDTO = { schedule: clonePlan().schedule, context: { tasks: [] } };
const CANDIDATES_PAYLOAD: CandidatesRequestDTO = { context: { tasks: [] }, task_ids: ['TASK-001'] };
const DISCOVER_PAYLOAD: DiscoverRequestDTO = { context: { tasks: [] }, task_ids: ['TASK-001'] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OptimizerClient base URL', () => {
  it('uses the Module 3 origin without an /api/v1 prefix', () => {
    const { client } = makeClient(() => jsonResponse(PLAN_RESPONSE));
    expect(client.getBaseUrl()).toBe('http://localhost:5002');
    expect(client.buildUrl('/api/optimizer/generate')).toBe('http://localhost:5002/api/optimizer/generate');
    expect(client.buildUrl('/api/optimizer/generate')).not.toContain('/api/v1');
  });

  it('normalises trailing slashes on a configured base URL', () => {
    const { client } = makeClient(() => jsonResponse(PLAN_RESPONSE), { baseUrl: 'http://localhost:5002///' });
    expect(client.buildUrl('/health')).toBe('http://localhost:5002/health');
  });
});

describe('OptimizerClient requests', () => {
  it('POSTs a generate request and returns the parsed DTO', async () => {
    const plan = clonePlan();
    const { client, calls } = makeClient(() => jsonResponse(plan));

    const result = await client.generatePlan(GENERATE_PAYLOAD);

    expect(result).toEqual(plan);
    expect(result.plan_id).toBe('PLAN-abc123');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://localhost:5002/api/optimizer/generate');
    expect(calls[0].headers['Content-Type']).toBe('application/json');
    expect(calls[0].headers.Accept).toBe('application/json');
    expect(calls[0].body).toEqual({ context: { tasks: [] } });
  });

  it('generates an x-request-id and preserves a caller-supplied one', async () => {
    const { client, calls } = makeClient(() => jsonResponse(PLAN_RESPONSE));

    await client.generatePlan(GENERATE_PAYLOAD);
    await client.generatePlan(GENERATE_PAYLOAD, { requestId: 'caller-supplied-id' });

    expect(calls[0].headers['x-request-id']).toBe('req-generated-1');
    expect(calls[1].headers['x-request-id']).toBe('caller-supplied-id');
  });

  it('GETs a stored plan by id', async () => {
    const plan = clonePlan();
    const { client, calls } = makeClient(() => jsonResponse(plan));

    const result = await client.getPlan('PLAN-abc123');

    expect(result.schedule.selected_blocks[0].block_id).toBe('BLK-0001');
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('http://localhost:5002/api/optimizer/plans/PLAN-abc123');
    expect(calls[0].body).toBeUndefined();
  });

  it('encodes the plan id in the path', async () => {
    const { client, calls } = makeClient(() => jsonResponse({ plan_id: 'x', metrics: {} }));
    await client.getPlan('PLAN/abc 1');
    expect(calls[0].url).toBe('http://localhost:5002/api/optimizer/plans/PLAN%2Fabc%201');
  });

  it('GETs plan metrics', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ plan_id: 'PLAN-abc123', metrics: { total_tasks_requested: 3 } }),
    );

    const result = await client.getPlanMetrics('PLAN-abc123');

    expect(result.metrics.total_tasks_requested).toBe(3);
    expect(calls[0].url).toBe('http://localhost:5002/api/optimizer/plans/PLAN-abc123/metrics');
  });

  it('GETs plan conflicts', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({
        plan_id: 'PLAN-abc123',
        solver_status: 'OPTIMAL',
        validation_valid: false,
        error_count: 1,
        warning_count: 1,
        errors: [],
        warnings: [],
        rejected_candidate_count: 1,
        candidate_rejection_codes: { TRAIN_MOVEMENT_CONFLICT: 1 },
      }),
    );

    const result = await client.getPlanConflicts('PLAN-abc123');

    expect(result.candidate_rejection_codes).toEqual({ TRAIN_MOVEMENT_CONFLICT: 1 });
    expect(calls[0].url).toBe('http://localhost:5002/api/optimizer/plans/PLAN-abc123/conflicts');
  });

  it('POSTs a validate request', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({
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
      }),
    );

    const result = await client.validateSchedule(VALIDATE_PAYLOAD);

    expect(result.valid).toBe(true);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://localhost:5002/api/optimizer/validate');
  });

  it('POSTs candidate and integrated-block discovery requests', async () => {
    const { client, calls } = makeClient((call) =>
      call.url.endsWith('/candidates')
        ? jsonResponse({ task_ids: ['TASK-001'], candidate_count: 0, feasible_count: 0, rejected_count: 0, rejection_codes: {}, candidates: [], data_mode: 'SYNTHETIC_DEMO', storage: 'IN_MEMORY' })
        : jsonResponse({ task_ids: ['TASK-001'], groups_examined: 1, compatible_count: 0, rejection_codes: {}, candidates: [], data_mode: 'SYNTHETIC_DEMO', storage: 'IN_MEMORY' }),
    );

    await client.getCandidates(CANDIDATES_PAYLOAD);
    await client.discoverIntegratedBlocks(DISCOVER_PAYLOAD);

    expect(calls[0].url).toBe('http://localhost:5002/api/optimizer/candidates');
    expect(calls[1].url).toBe('http://localhost:5002/api/optimizer/integrated-blocks/discover');
  });

  it('GETs health', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ status: 'ok', module: 'optimization-engine', dataMode: 'SYNTHETIC_DEMO' }),
    );

    const result = await client.getHealth();

    expect(result.module).toBe('optimization-engine');
    expect(calls[0].url).toBe('http://localhost:5002/health');
  });
});

describe('OptimizerClient structured errors', () => {
  const cases: Array<{ status: number; code: string }> = [
    { status: 400, code: 'EMPTY_CONTEXT' },
    { status: 404, code: 'NOT_FOUND' },
    { status: 409, code: 'PLAN_METRICS_UNAVAILABLE' },
    { status: 422, code: 'REQUEST_VALIDATION' },
    { status: 500, code: 'INTERNAL_ERROR' },
  ];

  it.each(cases)('exposes error.code for HTTP $status', async ({ status, code }) => {
    const { client } = makeClient(() =>
      jsonResponse(
        {
          error: {
            code,
            message: 'module 3 said no',
            details: { hint: 'regenerate the plan' },
            request_id: 'req-from-module-3',
          },
        },
        status,
      ),
    );

    const error = await client.getPlan('PLAN-abc123').catch((caught: unknown) => caught);

    expect(isOptimizerApiError(error)).toBe(true);
    const apiError = error as OptimizerApiError;
    expect(apiError.status).toBe(status);
    expect(apiError.code).toBe(code);
    expect(apiError.message).toBe('module 3 said no');
    expect(apiError.details).toEqual({ hint: 'regenerate the plan' });
    expect(apiError.requestId).toBe('req-from-module-3');
    expect(apiError.isHttpError).toBe(true);
  });

  it('falls back to a safe code and message when the body is not the envelope', async () => {
    const { client } = makeClient(
      () => new Response('<html>Traceback (most recent call last): ...</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
    );

    const error = (await client.getPlan('PLAN-abc123').catch((caught: unknown) => caught)) as OptimizerApiError;

    expect(error.code).toBe('HTTP_502');
    expect(error.message).toBe('Module 3 request failed with status 502');
    expect(error.message).not.toContain('Traceback');
    expect(JSON.stringify(error.details)).toBe('{}');
  });

  it('falls back to INTERNAL_ERROR for a bodyless 500', async () => {
    const { client } = makeClient(() => new Response('', { status: 500 }));

    const error = (await client.getHealth().catch((caught: unknown) => caught)) as OptimizerApiError;

    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe('Module 3 request failed with status 500');
  });

  it('keeps the caller request id when Module 3 omits it', async () => {
    const { client } = makeClient(() => jsonResponse({ error: { code: 'NOT_FOUND', message: 'gone', details: {} } }, 404));

    const error = (await client.getPlan('PLAN-abc123').catch((caught: unknown) => caught)) as OptimizerApiError;

    expect(error.code).toBe('NOT_FOUND');
    expect(error.requestId).toBe('req-generated-1');
  });

  it('rejects a non-JSON success body as INVALID_RESPONSE', async () => {
    const { client } = makeClient(() => new Response('not json', { status: 200 }));

    const error = (await client.getHealth().catch((caught: unknown) => caught)) as OptimizerApiError;

    expect(error.kind).toBe('parse');
    expect(error.code).toBe('INVALID_RESPONSE');
  });

  it('reports an unreachable Module 3 as a network error', async () => {
    const { client } = makeClient(() => {
      throw new TypeError('Failed to fetch');
    });

    const error = (await client.getHealth().catch((caught: unknown) => caught)) as OptimizerApiError;

    expect(error.kind).toBe('network');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
  });
});

describe('OptimizerClient cancellation', () => {
  it('rejects with the abort reason when the caller aborts in flight', async () => {
    const controller = new AbortController();
    const fetchImpl: OptimizerFetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(makeAbortError()));
      });
    const client = createOptimizerClient({ baseUrl: DEFAULT_OPTIMIZER_BASE_URL, fetchImpl, timeoutMs: 0 });

    const pending = client.generatePlan(GENERATE_PAYLOAD, { signal: controller.signal });
    controller.abort();

    const error = await pending.then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(isOptimizerAbortError(error)).toBe(true);
    expect(isOptimizerApiError(error)).toBe(false);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const seen: Array<AbortSignal | null | undefined> = [];
    const fetchImpl: OptimizerFetch = (_input, init) => {
      seen.push(init?.signal);
      return Promise.reject(makeAbortError());
    };
    const client = createOptimizerClient({ baseUrl: DEFAULT_OPTIMIZER_BASE_URL, fetchImpl, timeoutMs: 0 });

    const error = await client.getHealth({ signal: controller.signal }).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(isOptimizerAbortError(error)).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.aborted).toBe(true);
  });

  it('times out into a REQUEST_TIMEOUT error', async () => {
    const fetchImpl: OptimizerFetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(makeAbortError()));
      });
    const client = createOptimizerClient({ baseUrl: DEFAULT_OPTIMIZER_BASE_URL, fetchImpl, timeoutMs: 5 });

    const error = (await client.getHealth().catch((caught: unknown) => caught)) as OptimizerApiError;

    expect(isOptimizerApiError(error)).toBe(true);
    expect(error.kind).toBe('timeout');
    expect(error.code).toBe('REQUEST_TIMEOUT');
  });
});
