/**
 * RailOpt Module 4 - Module 3 (Optimization Engine) service layer.
 *
 * Responsibilities:
 *   - call the real Module 3 API through `optimizerClient` (transport DTOs);
 *   - run every response through `adapters/optimizer.ts` (Module 4 view models);
 *   - keep the client-side `plan_id` state, because Module 3 has no plan list.
 *
 * This is OPT-IN: while `API_CONFIG.useRealOptimizer` is false (the default)
 * nothing here touches the network, and the existing mock services stay in
 * charge of the UI.
 *
 * Phase 9B-1: when `generatePlan()` is called with NO payload, the request is
 * Module 3's own deterministic SYNTHETIC_DEMO body, vendored verbatim in
 * `./optimizerDemoRequest`. That is an interim path: the real Module 4 -> Module 3
 * mapping is still blocked (see that module for the specific gaps), so nothing
 * here may present synthetic records as real railway data. The payload module is
 * loaded with a dynamic import so the ~217 KB fixture is only fetched when the
 * real optimizer is actually enabled and used.
 */

import { API_CONFIG } from './api.config';
import {
  OptimizerClient,
  createOptimizerClient,
  isOptimizerApiError,
  type OptimizerClientOptions,
  type OptimizerRequestOptions,
} from './optimizerClient';
import {
  OptimizerPlanStateStore,
  optimizerPlanState,
  planStateWarnings,
} from './optimizerPlanState';
import {
  mapCandidatesResponse,
  mapHealth,
  mapIntegratedBlocksResponse,
  mapPlan,
  mapPlanConflictsResponse,
  mapPlanMetricsResponse,
  mapValidationResponse,
} from '@/adapters/optimizer';
import type { OptimizerProvenanceEntry, OptimizerRequestProvenance } from './optimizerDemoRequest';
import { buildOptimizeRequest } from './optimizerRequestBuilder';
import type {
  Module4ReadinessSnapshot,
  OptimizerRequestReadiness,
  OptimizerReadinessInput,
} from './optimizerRequestReadiness';
import type {
  CandidatesRequestDTO,
  DiscoverRequestDTO,
  OptimizeRequestDTO,
  OptimizerCandidatesResult,
  OptimizerHealth,
  OptimizerIntegratedBlocksResult,
  OptimizerPlan,
  OptimizerPlanConflicts,
  OptimizerPlanMetrics,
  OptimizerValidationResult,
  ValidateRequestDTO,
} from '@/types/optimizer';

export class OptimizerDisabledError extends Error {
  constructor() {
    super(
      'The Module 3 optimizer API is disabled. Set VITE_USE_REAL_OPTIMIZER_API=true to enable it (mock services remain the default).',
    );
    this.name = 'OptimizerDisabledError';
  }
}

/**
 * One unsatisfied Module 3 input, flattened for a future diagnostic surface.
 *
 * Carries the readiness verdict verbatim. The service does not interpret,
 * re-word or re-rank it: a UI that wants to explain "why is this blocked" must
 * show what readiness actually said, not a paraphrase invented at the transport
 * layer.
 */
export interface OptimizerBlocker {
  readonly id: string;
  readonly field: string;
  readonly collection: string;
  readonly requirement: string;
  readonly reason: string;
  readonly status: OptimizerReadinessInput['status'];
  readonly source: OptimizerReadinessInput['source'];
  readonly resolvableByUserAction: boolean;
  readonly coverage: OptimizerReadinessInput['coverage'];
}

/**
 * Service-level outcome of a real Module 4 optimization attempt.
 *
 * A discriminated union rather than a nullable plan, because the two outcomes
 * mean genuinely different things:
 *
 *   - `PLAN`    - Module 3 ran and returned a schedule.
 *   - `BLOCKED` - Module 4's data cannot honestly produce a Module 3 request.
 *                  NOTHING was sent. This is NOT an API error and NOT an empty
 *                  plan, and it is deliberately not thrown, so it can never be
 *                  confused with a transport failure.
 *
 * Existing network/API failures still reject through the unchanged
 * `OptimizerApiError` path, so callers can tell the three apart by kind:
 * resolved `PLAN`, resolved `BLOCKED`, or rejected promise.
 */
export type OptimizerModule4Result =
  | {
      readonly kind: 'PLAN';
      readonly plan: OptimizerPlan;
      readonly readiness: OptimizerRequestReadiness;
      readonly provenance: readonly OptimizerProvenanceEntry[];
      readonly emitted: readonly string[];
      readonly omitted: readonly { readonly collection: string; readonly blockedBy: readonly string[] }[];
    }
  | {
      readonly kind: 'BLOCKED';
      readonly readiness: OptimizerRequestReadiness;
      readonly blockers: readonly OptimizerBlocker[];
      readonly provenance: readonly OptimizerProvenanceEntry[];
    };

function toBlocker(input: OptimizerReadinessInput): OptimizerBlocker {
  return {
    id: input.id,
    field: input.field,
    collection: input.collection,
    requirement: input.requirement,
    reason: input.reason,
    status: input.status,
    source: input.source,
    resolvableByUserAction: input.resolvableByUserAction,
    coverage: input.coverage,
  };
}

/**
 * Provenance for a request that was never built.
 *
 * On the blocked path there is no payload to describe, so provenance is derived
 * from the readiness verdicts instead: one entry per input, labelled with the
 * source readiness itself assigned. This is a description of the DECISION, not a
 * claim about a payload that does not exist.
 */
function provenanceFromReadiness(readiness: OptimizerRequestReadiness): OptimizerProvenanceEntry[] {
  return readiness.inputs.map((input) => ({
    field: input.field,
    label: input.source,
    count: input.coverage === null ? null : input.coverage.total,
    reason: input.reason,
  }));
}

let client: OptimizerClient | null = null;
let clientSignature: string | null = null;

/** Signature value reserved for an externally injected client. */
const INJECTED_SIGNATURE = 'injected';

function signatureOf(options: OptimizerClientOptions): string {
  return JSON.stringify([
    options.baseUrl ?? API_CONFIG.module3OptimizerApi,
    options.timeoutMs ?? null,
    options.fetchImpl ? 'custom-fetch' : null,
    options.requestIdFactory ? 'custom-request-id' : null,
  ]);
}

/** Lazily builds the singleton client from `API_CONFIG` (or an explicit override). */
export function getOptimizerClient(overrides: OptimizerClientOptions = {}): OptimizerClient {
  // An injected client always wins, whatever the configuration says.
  if (client && clientSignature === INJECTED_SIGNATURE) return client;
  const signature = signatureOf(overrides);
  if (client && clientSignature === signature) return client;
  client = createOptimizerClient({
    baseUrl: API_CONFIG.module3OptimizerApi,
    ...overrides,
  });
  clientSignature = signature;
  return client;
}

/** Test seam: inject or drop the client without touching the feature switch. */
export function setOptimizerClient(next: OptimizerClient | null): void {
  client = next;
  // A sentinel that never equals a computed signature, so an injected client
  // is returned as-is instead of being rebuilt from API_CONFIG.
  clientSignature = next === null ? null : INJECTED_SIGNATURE;
}

export function isOptimizerEnabled(): boolean {
  return API_CONFIG.useRealOptimizer;
}

function requireEnabled(): void {
  if (!isOptimizerEnabled()) throw new OptimizerDisabledError();
}

function resolvePlanId(planId: string | undefined, state: OptimizerPlanStateStore): string {
  if (planId !== undefined && planId.trim() !== '') return planId;
  return state.requirePlanId();
}

/**
 * Loads Module 3's vendored SYNTHETIC_DEMO generate payload.
 *
 * Dynamic so the fixture stays out of the bundle while mock mode is in charge,
 * and so a disabled optimizer never pays for it.
 */
async function loadSyntheticDemoRequest(): Promise<OptimizeRequestDTO> {
  const { buildSyntheticDemoOptimizeRequest } = await import('./optimizerDemoRequest');
  return buildSyntheticDemoOptimizeRequest();
}

export const optimizerService = {
  /** Feature switch: false keeps the mock services in charge. */
  isEnabled(): boolean {
    return isOptimizerEnabled();
  },

  /** Plan id captured from the last successful `generatePlan()`. */
  getPlanState() {
    return optimizerPlanState.getState();
  },

  /** Lifetime caveats (IN_MEMORY storage, SYNTHETIC_DEMO data, 404 handling). */
  getPlanStateWarnings(): string[] {
    return planStateWarnings(optimizerPlanState.getState());
  },

  resetPlanState(): void {
    optimizerPlanState.clear();
  },

  async getHealth(options: OptimizerRequestOptions = {}): Promise<OptimizerHealth> {
    requireEnabled();
    return mapHealth(await getOptimizerClient().getHealth(options));
  },

  /**
   * Provenance of the synthetic-demo payload, so the UI can label every field's
   * origin (mapped / Module 3 default / synthetic / unavailable) instead of
   * showing synthetic records as real railway data.
   */
  async getSyntheticDemoProvenance(): Promise<OptimizerRequestProvenance> {
    requireEnabled();
    const { describeSyntheticDemoProvenance } = await import('./optimizerDemoRequest');
    return describeSyntheticDemoProvenance();
  },

  /**
   * POST /api/optimizer/generate using Module 3's own SYNTHETIC_DEMO payload -
   * also records `plan_id` in client state.
   *
   * Omitting `payload` is equivalent to calling `generateSyntheticDemoPlan()`.
   */
  async generatePlan(payload?: OptimizeRequestDTO, options: OptimizerRequestOptions = {}): Promise<OptimizerPlan> {
    requireEnabled();
    const body = payload ?? (await loadSyntheticDemoRequest());
    const dto = await getOptimizerClient().generatePlan(body, options);
    const plan = mapPlan(dto);
    optimizerPlanState.record({
      planId: plan.planId,
      requestId: plan.requestId,
      dataMode: plan.dataMode,
      storage: plan.storage,
      solverStatus: plan.solverStatus,
    });
    return plan;
  },

  /**
   * Unambiguous alias for `generatePlan()` with no payload.
   *
   * Phase 9B-1 interim path: the payload is Module 3's deterministic
   * SYNTHETIC_DEMO world, not Module 4 data. See `./optimizerDemoRequest`.
   */
  async generateSyntheticDemoPlan(options: OptimizerRequestOptions = {}): Promise<OptimizerPlan> {
    return optimizerService.generatePlan(undefined, options);
  },

  /**
   * Phase 9B-2E: the REAL Module 4 path.
   *
   * Assembles the Module 3 request from Module 4 records via the readiness-gated
   * builder, and sends it only if the builder succeeded.
   *
   * The invariants, in order of importance:
   *
   *   1. A BLOCKED builder NEVER reaches the network. No client is even
   *      constructed for that call. An optimizer handed a partly-real railway
   *      world returns a confident, wrong schedule, so refusing to send is the
   *      whole point - not a degraded send.
   *   2. On success the builder's request is passed to the client EXACTLY as
   *      built. It is not cloned, re-keyed, defaulted, pruned or annotated. If
   *      the payload needs changing, that belongs in the builder, where the
   *      readiness gate can see it.
   *   3. Blocking is a RESULT, not an exception. It returns `{ kind: 'BLOCKED' }`.
   *      Network and API failures keep rejecting through the existing
   *      `OptimizerApiError` path, so the two are never conflated.
   *   4. This method performs no Module 4 -> Module 3 mapping of its own. It
   *      forwards a built payload; it does not interpret, convert or default.
   *
   * The synthetic-demo path is deliberately NOT reachable from here: it must
   * never be mixed with Module 4 records. Use `generateSyntheticDemoPlan()`.
   */
  async generatePlanFromModule4(
    snapshot: Module4ReadinessSnapshot,
    options: OptimizerRequestOptions = {},
  ): Promise<OptimizerModule4Result> {
    requireEnabled();

    const build = buildOptimizeRequest(snapshot);

    if (!build.ok) {
      // Nothing is sent. No client is touched, so there is no request to log,
      // no request id burned, and no partial state to unwind.
      return {
        kind: 'BLOCKED',
        readiness: build.readiness,
        blockers: build.blockers.map(toBlocker),
        provenance: provenanceFromReadiness(build.readiness),
      };
    }

    // Sent exactly as built - no post-processing between builder and client.
    const dto = await getOptimizerClient().generatePlan(build.request, options);
    const plan = mapPlan(dto);
    optimizerPlanState.record({
      planId: plan.planId,
      requestId: plan.requestId,
      dataMode: plan.dataMode,
      storage: plan.storage,
      solverStatus: plan.solverStatus,
    });

    return {
      kind: 'PLAN',
      plan,
      readiness: build.readiness,
      provenance: build.provenance,
      emitted: build.emitted,
      omitted: build.omitted,
    };
  },

  /** GET /api/optimizer/plans/{plan_id} - defaults to the stored plan id. */
  async getPlan(planId?: string, options: OptimizerRequestOptions = {}): Promise<OptimizerPlan> {
    requireEnabled();
    const target = resolvePlanId(planId, optimizerPlanState);
    try {
      return mapPlan(await getOptimizerClient().getPlan(target, options));
    } catch (error) {
      handlePlanReadFailure(error, target);
      throw error;
    }
  },

  /** GET /api/optimizer/plans/{plan_id}/metrics */
  async getPlanMetrics(planId?: string, options: OptimizerRequestOptions = {}): Promise<OptimizerPlanMetrics> {
    requireEnabled();
    const target = resolvePlanId(planId, optimizerPlanState);
    try {
      return mapPlanMetricsResponse(await getOptimizerClient().getPlanMetrics(target, options));
    } catch (error) {
      handlePlanReadFailure(error, target);
      throw error;
    }
  },

  /** GET /api/optimizer/plans/{plan_id}/conflicts */
  async getPlanConflicts(planId?: string, options: OptimizerRequestOptions = {}): Promise<OptimizerPlanConflicts> {
    requireEnabled();
    const target = resolvePlanId(planId, optimizerPlanState);
    try {
      return mapPlanConflictsResponse(await getOptimizerClient().getPlanConflicts(target, options));
    } catch (error) {
      handlePlanReadFailure(error, target);
      throw error;
    }
  },

  /** POST /api/optimizer/candidates */
  async getCandidates(payload: CandidatesRequestDTO, options: OptimizerRequestOptions = {}): Promise<OptimizerCandidatesResult> {
    requireEnabled();
    return mapCandidatesResponse(await getOptimizerClient().getCandidates(payload, options));
  },

  /** POST /api/optimizer/integrated-blocks/discover */
  async discoverIntegratedBlocks(
    payload: DiscoverRequestDTO,
    options: OptimizerRequestOptions = {},
  ): Promise<OptimizerIntegratedBlocksResult> {
    requireEnabled();
    return mapIntegratedBlocksResponse(await getOptimizerClient().discoverIntegratedBlocks(payload, options));
  },

  /** POST /api/optimizer/validate - pure validation, never runs the optimizer. */
  async validateSchedule(payload: ValidateRequestDTO, options: OptimizerRequestOptions = {}): Promise<OptimizerValidationResult> {
    requireEnabled();
    return mapValidationResponse(await getOptimizerClient().validateSchedule(payload, options));
  },
};

/**
 * A 404 on a plan read means the in-memory store no longer holds that plan
 * (Module 3 restarted). The stored id is dropped so no stale id is reused; the
 * original error is rethrown for the UI.
 */
function handlePlanReadFailure(error: unknown, planId: string): void {
  if (isOptimizerApiError(error) && error.status === 404) {
    optimizerPlanState.markUnavailable(
      `Module 3 has no plan '${planId}' (in-memory plans do not survive a Module 3 restart)`,
    );
  }
}

export { optimizerPlanState, OptimizerPlanStateStore, OptimizerPlanUnavailableError } from './optimizerPlanState';
export type { OptimizerPlanState } from './optimizerPlanState';
export type {
  OptimizerProvenanceEntry,
  OptimizerProvenanceLabel,
  OptimizerRequestProvenance,
} from './optimizerDemoRequest';
export {
  OptimizerApiError,
  createOptimizerClient,
  isOptimizerApiError,
  isOptimizerAbortError,
  DEFAULT_OPTIMIZER_BASE_URL,
} from './optimizerClient';
export type { OptimizerClientOptions, OptimizerRequestOptions } from './optimizerClient';
export type { Module4ReadinessSnapshot } from './optimizerRequestReadiness';
