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

  /** POST /api/optimizer/generate - also records `plan_id` in client state. */
  async generatePlan(payload: OptimizeRequestDTO, options: OptimizerRequestOptions = {}): Promise<OptimizerPlan> {
    requireEnabled();
    const dto = await getOptimizerClient().generatePlan(payload, options);
    const plan = mapPlan(dto);
    optimizerPlanState.record({
      planId: plan.planId,
      requestId: plan.requestId,
      dataMode: plan.dataMode,
      storage: plan.storage,
    });
    return plan;
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
export {
  OptimizerApiError,
  createOptimizerClient,
  isOptimizerApiError,
  isOptimizerAbortError,
  DEFAULT_OPTIMIZER_BASE_URL,
} from './optimizerClient';
export type { OptimizerClientOptions, OptimizerRequestOptions } from './optimizerClient';
