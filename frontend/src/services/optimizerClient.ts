/**
 * RailOpt Module 4 - Module 3 (Optimization Engine) HTTP client.
 *
 * Transport only: this module speaks the Module 3 wire contract
 * (`src/types/optimizer.ts` transport DTOs) and never renames, defaults or
 * re-shapes a field. All snake_case -> camelCase work happens in
 * `src/adapters/optimizer.ts`.
 *
 * Transport rules honoured here:
 *   - `fetch` only (the project has no axios dependency)
 *   - `AbortSignal` support on every call, plus a per-request timeout
 *   - JSON request/response bodies
 *   - `x-request-id` generated per request, preserved when the caller supplies one
 *   - the documented error envelope `{ error: { code, message, details, request_id } }`
 *     is parsed into a typed `OptimizerApiError`; the UI is expected to show
 *     `error.code`/`error.message`, never a raw stack trace.
 */

import type {
  CandidatesRequestDTO,
  CandidatesResponse,
  DiscoverRequestDTO,
  HealthResponse,
  IntegratedBlocksResponse,
  OptimizeRequestDTO,
  PlanConflictsResponse,
  PlanMetricsResponse,
  PlanResponse,
  ValidateRequestDTO,
  ValidationResponse,
} from '@/types/optimizer';

/** Development default. Module 3 mounts routes at `/api/optimizer/*` on this origin. */
export const DEFAULT_OPTIMIZER_BASE_URL = 'http://localhost:5002';

export const OPTIMIZER_ROUTES = {
  health: '/health',
  generate: '/api/optimizer/generate',
  candidates: '/api/optimizer/candidates',
  discoverIntegratedBlocks: '/api/optimizer/integrated-blocks/discover',
  validate: '/api/optimizer/validate',
  plan: (planId: string) => `/api/optimizer/plans/${encodeURIComponent(planId)}`,
  planMetrics: (planId: string) => `/api/optimizer/plans/${encodeURIComponent(planId)}/metrics`,
  planConflicts: (planId: string) => `/api/optimizer/plans/${encodeURIComponent(planId)}/conflicts`,
} as const;

export const DEFAULT_TIMEOUT_MS = 30_000;

/** How a client-side failure happened, independent of any HTTP status. */
export type OptimizerErrorKind = 'http' | 'network' | 'timeout' | 'parse';

export interface OptimizerApiErrorInit {
  kind: OptimizerErrorKind;
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId: string | null;
  /** Never populated with a response body: Module 3 must not leak internals. */
  cause?: unknown;
}

/**
 * Structured transport failure. `code` is the machine-readable value the UI
 * should surface (Module 3 `error.code` for HTTP failures).
 */
export class OptimizerApiError extends Error {
  readonly kind: OptimizerErrorKind;
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;

  constructor(init: OptimizerApiErrorInit) {
    super(init.message);
    this.name = 'OptimizerApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
    if (init.cause !== undefined) {
      (this as { cause?: unknown }).cause = init.cause;
    }
  }

  /** True when Module 3 answered with a structured 4xx/5xx envelope. */
  get isHttpError(): boolean {
    return this.kind === 'http';
  }
}

export function isOptimizerApiError(value: unknown): value is OptimizerApiError {
  return value instanceof OptimizerApiError;
}

/** Abort rejections are control flow, not errors: never surface them as failures. */
export function isOptimizerAbortError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const name = (value as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export interface OptimizerRequestOptions {
  signal?: AbortSignal;
  /** Preserved verbatim as `x-request-id`; generated when omitted. */
  requestId?: string;
  /** Overrides the client default for this call only. `0` disables the timeout. */
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface OptimizerClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Injected for tests / non-browser hosts. Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected for deterministic tests. Defaults to a UUID-ish generator. */
  requestIdFactory?: () => string;
}

export type OptimizerFetch = typeof fetch;

let fallbackRequestIdCounter = 0;

/** UUID when available, otherwise a monotonic id. Never throws. */
export function defaultRequestIdFactory(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  fallbackRequestIdCounter += 1;
  return `m4-${Date.now().toString(36)}-${fallbackRequestIdCounter.toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asErrorDetails(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asRequestId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asMessage(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * Reads the documented Module 3 envelope
 * `{ error: { code, message, details, request_id } }`.
 *
 * Anything that is not that shape (proxy HTML, an empty body, a bare FastAPI
 * payload) is reduced to a safe generic message: a raw body could contain a
 * traceback, and the UI must not be able to render one.
 */
export function parseOptimizerErrorBody(body: unknown, status: number, requestId: string | null): OptimizerApiError {
  // Mirrors Module 3's own status -> code fallback (`api/errors.py`).
  const fallbackCode = status === 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`;
  const fallbackMessage = `Module 3 request failed with status ${status}`;

  if (!isRecord(body) || !isRecord(body.error)) {
    return new OptimizerApiError({
      kind: 'http',
      status,
      code: fallbackCode,
      message: fallbackMessage,
      details: {},
      requestId,
    });
  }

  const error = body.error;
  return new OptimizerApiError({
    kind: 'http',
    status,
    code: asCode(error.code, fallbackCode),
    message: asMessage(error.message, fallbackMessage),
    details: asErrorDetails(error.details),
    requestId: asRequestId(error.request_id) ?? requestId,
  });
}

function linkAbortSignals(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal | undefined; dispose: () => void; timedOut: () => boolean } {
  if (!signal && timeoutMs <= 0) {
    return { signal: undefined, dispose: () => undefined, timedOut: () => false };
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort);
    }
  }

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    },
  };
}

export class OptimizerClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: OptimizerFetch;
  private readonly requestIdFactory: () => string;

  constructor(options: OptimizerClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_OPTIMIZER_BASE_URL);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultHeaders = { ...(options.headers ?? {}) };
    this.fetchImpl = options.fetchImpl ?? resolveGlobalFetch();
    this.requestIdFactory = options.requestIdFactory ?? defaultRequestIdFactory;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  buildUrl(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, options: OptimizerRequestOptions = {}): Promise<T> {
    const requestId = options.requestId?.trim() ? options.requestId : this.requestIdFactory();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'x-request-id': requestId,
      ...this.defaultHeaders,
      ...(options.headers ?? {}),
    };

    let payload: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const link = linkAbortSignals(options.signal, timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(path), {
        method,
        headers,
        body: payload,
        signal: link.signal,
      });
    } catch (cause) {
      if (link.timedOut()) {
        throw new OptimizerApiError({
          kind: 'timeout',
          status: 0,
          code: 'REQUEST_TIMEOUT',
          message: `Module 3 did not respond within ${timeoutMs}ms`,
          details: {},
          requestId,
          cause,
        });
      }
      if (isOptimizerAbortError(cause)) {
        // Caller-initiated cancellation: rethrown untouched so callers can
        // distinguish it from a failure.
        throw cause;
      }
      throw new OptimizerApiError({
        kind: 'network',
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Module 3 could not be reached',
        details: {},
        requestId,
        cause,
      });
    } finally {
      link.dispose();
    }

    return this.readResponse<T>(response, requestId);
  }

  private async readResponse<T>(response: Response, requestId: string): Promise<T> {
    const rawBody = await response.text();
    const isEmpty = rawBody.trim() === '';

    if (!response.ok) {
      throw parseOptimizerErrorBody(isEmpty ? null : tryParseJson(rawBody), response.status, requestId);
    }

    if (isEmpty) {
      return undefined as T;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (cause) {
      throw new OptimizerApiError({
        kind: 'parse',
        status: response.status,
        code: 'INVALID_RESPONSE',
        message: 'Module 3 returned a response that is not valid JSON',
        details: {},
        requestId,
        cause,
      });
    }
    return parsed as T;
  }

  // ── Module 3 endpoints (transport DTOs in, transport DTOs out) ────────────

  getHealth(options: OptimizerRequestOptions = {}): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', OPTIMIZER_ROUTES.health, undefined, options);
  }

  generatePlan(payload: OptimizeRequestDTO, options: OptimizerRequestOptions = {}): Promise<PlanResponse> {
    return this.request<PlanResponse>('POST', OPTIMIZER_ROUTES.generate, payload, options);
  }

  getCandidates(payload: CandidatesRequestDTO, options: OptimizerRequestOptions = {}): Promise<CandidatesResponse> {
    return this.request<CandidatesResponse>('POST', OPTIMIZER_ROUTES.candidates, payload, options);
  }

  discoverIntegratedBlocks(payload: DiscoverRequestDTO, options: OptimizerRequestOptions = {}): Promise<IntegratedBlocksResponse> {
    return this.request<IntegratedBlocksResponse>('POST', OPTIMIZER_ROUTES.discoverIntegratedBlocks, payload, options);
  }

  validateSchedule(payload: ValidateRequestDTO, options: OptimizerRequestOptions = {}): Promise<ValidationResponse> {
    return this.request<ValidationResponse>('POST', OPTIMIZER_ROUTES.validate, payload, options);
  }

  getPlan(planId: string, options: OptimizerRequestOptions = {}): Promise<PlanResponse> {
    return this.request<PlanResponse>('GET', OPTIMIZER_ROUTES.plan(planId), undefined, options);
  }

  getPlanMetrics(planId: string, options: OptimizerRequestOptions = {}): Promise<PlanMetricsResponse> {
    return this.request<PlanMetricsResponse>('GET', OPTIMIZER_ROUTES.planMetrics(planId), undefined, options);
  }

  getPlanConflicts(planId: string, options: OptimizerRequestOptions = {}): Promise<PlanConflictsResponse> {
    return this.request<PlanConflictsResponse>('GET', OPTIMIZER_ROUTES.planConflicts(planId), undefined, options);
  }
}

/** Trims trailing slashes so route concatenation never yields `//api/...`. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function resolveGlobalFetch(): OptimizerFetch {
  const globalFetch = (globalThis as { fetch?: OptimizerFetch }).fetch;
  if (typeof globalFetch === 'function') {
    return globalFetch.bind(globalThis) as OptimizerFetch;
  }
  return () => {
    throw new OptimizerApiError({
      kind: 'network',
      status: 0,
      code: 'NO_FETCH',
      message: 'No fetch implementation is available in this environment',
      details: {},
      requestId: null,
    });
  };
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createOptimizerClient(options: OptimizerClientOptions = {}): OptimizerClient {
  return new OptimizerClient(options);
}
