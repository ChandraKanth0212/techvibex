/**
 * RailOpt Module 4 - client-side Module 3 plan state.
 *
 * Module 3 has NO plan-list endpoint: the only way to learn a `plan_id` is the
 * response of `POST /api/optimizer/generate`. Module 4 therefore keeps the id
 * in client state and reuses it for
 *   GET /api/optimizer/plans/{plan_id}
 *   GET /api/optimizer/plans/{plan_id}/metrics
 *   GET /api/optimizer/plans/{plan_id}/conflicts
 *
 * Lifetime caveats, enforced here rather than assumed by callers:
 *   - Module 3 `storage` is `IN_MEMORY`: plans do not survive a Module 3 restart.
 *   - Module 3 `data_mode` is `SYNTHETIC_DEMO`: results are synthetic demo data.
 *   - A 404 therefore means "regenerate", not "retry later".
 *
 * State is intentionally session-scoped (module singleton, in-memory only). It
 * is NOT persisted: a reload must not resurrect a plan id that Module 3 has
 * already dropped.
 */

export type OptimizerPlanAvailability = 'EMPTY' | 'AVAILABLE' | 'UNAVAILABLE';

export interface OptimizerPlanState {
  /** `null` until a plan has been generated, or after it became unavailable. */
  planId: string | null;
  requestId: string | null;
  dataMode: string | null;
  storage: string | null;
  /**
   * Module 3 `solver_status`, captured verbatim (e.g. `OPTIMAL`). Optional at the
   * call site so an older four-field `record()` still compiles.
   */
  solverStatus: string | null;
  availability: OptimizerPlanAvailability;
  /** Why the stored id is unusable, when `availability === 'UNAVAILABLE'`. */
  unavailableReason: string | null;
  /** Remembers the last id Module 3 gave us, for diagnostics after a 404. */
  lastKnownPlanId: string | null;
  /** Client-side capture time (ISO). Never derived from Module 3 payloads. */
  capturedAt: string | null;
}

export type OptimizerPlanStateListener = (state: OptimizerPlanState) => void;

export class OptimizerPlanUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`No Module 3 plan id is available: ${reason}`);
    this.name = 'OptimizerPlanUnavailableError';
    this.reason = reason;
  }
}

function emptyState(): OptimizerPlanState {
  return {
    planId: null,
    requestId: null,
    dataMode: null,
    storage: null,
    solverStatus: null,
    availability: 'EMPTY',
    unavailableReason: null,
    lastKnownPlanId: null,
    capturedAt: null,
  };
}

export class OptimizerPlanStateStore {
  private state: OptimizerPlanState = emptyState();
  private readonly listeners = new Set<OptimizerPlanStateListener>();

  getState(): OptimizerPlanState {
    return { ...this.state };
  }

  getPlanId(): string | null {
    return this.state.planId;
  }

  /** Records the id returned by a successful `generatePlan`. */
  record(plan: { planId: string; requestId: string; dataMode: string; storage: string; solverStatus?: string }): OptimizerPlanState {
    this.state = {
      planId: plan.planId,
      requestId: plan.requestId,
      dataMode: plan.dataMode,
      storage: plan.storage,
      solverStatus: plan.solverStatus ?? null,
      availability: 'AVAILABLE',
      unavailableReason: null,
      lastKnownPlanId: plan.planId,
      capturedAt: new Date().toISOString(),
    };
    this.emit();
    return this.getState();
  }

  /** Marks the stored id unusable (e.g. Module 3 answered 404 after a restart). */
  markUnavailable(reason: string): OptimizerPlanState {
    this.state = {
      ...this.state,
      planId: null,
      availability: 'UNAVAILABLE',
      unavailableReason: reason,
    };
    this.emit();
    return this.getState();
  }

  clear(): OptimizerPlanState {
    this.state = emptyState();
    this.emit();
    return this.getState();
  }

  /** Plan id to use for a follow-up read, or a typed error explaining its absence. */
  requirePlanId(): string {
    if (this.state.planId) return this.state.planId;
    const reason =
      this.state.availability === 'UNAVAILABLE' && this.state.unavailableReason
        ? this.state.unavailableReason
        : 'no plan has been generated in this session yet';
    throw new OptimizerPlanUnavailableError(reason);
  }

  subscribe(listener: OptimizerPlanStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

/** App-wide store for the single most recently generated Module 3 plan. */
export const optimizerPlanState = new OptimizerPlanStateStore();

/** Human-readable warnings derived from the envelope Module 3 actually sent. */
export function planStateWarnings(state: OptimizerPlanState): string[] {
  const warnings: string[] = [];
  if (state.storage !== null && state.storage !== 'IN_MEMORY') {
    warnings.push(`Unexpected Module 3 storage '${state.storage}'; only IN_MEMORY is supported.`);
  }
  if (state.dataMode !== null && state.dataMode !== 'SYNTHETIC_DEMO') {
    warnings.push(`Unexpected Module 3 data_mode '${state.dataMode}'; this integration is verified against SYNTHETIC_DEMO.`);
  }
  if (state.availability === 'UNAVAILABLE') {
    warnings.push(
      `The stored plan is no longer available in Module 3 (${state.unavailableReason ?? 'unknown reason'}). Regenerate the plan; in-memory plans do not survive a Module 3 restart.`,
    );
  }
  return warnings;
}
