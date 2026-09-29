/**
 * RailOpt Domain Entities: Train & GoodsForecast
 * Represents scheduled train services and probabilistic freight/goods flow forecasts.
 */

export type TrainType = 'PASSENGER' | 'EXPRESS' | 'GOODS' | 'OTHER';
export type DirectionType = 'UP' | 'DOWN';
export type TrainStatus = 'SCHEDULED' | 'RUNNING' | 'DELAYED' | 'CANCELLED' | 'REROUTED';

export interface Train {
  trainId: string;
  /**
   * Module 3 `TrainMovement.movement_id`: the identity of the movement itself,
   * which is not the identity of the service. A train that runs daily has one
   * `trainId` and many movements, so these are separate facts.
   *
   * `trainId` is NOT renamed to `movementId` and is NOT accepted as a substitute:
   * doing so would assert that a service and one of its runs are the same thing.
   * Optional because no Module 4 source emits it yet; when absent, the movement
   * identity is unavailable rather than inferred.
   */
  movementId?: string;
  trainNumber: string;
  trainType: TrainType;
  sectionId: string;
  corridorId?: string;
  direction: DirectionType;
  arrivalTime: string;   // ISO datetime string
  departureTime: string; // ISO datetime string
  operationalPriority: number;
  status: TrainStatus;
}

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ForecastSource = 'FREIGHT_FOIS_FEED' | 'AI_PREDICTIVE_MODEL' | 'HISTORICAL_PATTERN';
export type ForecastStatus = 'PROJECTED' | 'CONFIRMED' | 'SUPERSEDED' | 'CANCELLED';

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9B-8, Decision D: a per-run movement register is authoritative.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shape the authoritative movement register must deliver.
 *
 * A contract, not data. `Train.movementId` stays unavailable until a real
 * register speaks this shape, because the alternative is inventing movement
 * identities for 20 services and presenting the invention as a schedule.
 *
 * Every field is REQUIRED, and two of them are required precisely so that
 * `movementId` cannot be a relabelled `trainId`:
 *   - `runDate`/`runIdentity` distinguish one run of a service from another. A
 *     service-stable id is not sufficient: it would let two runs of the same
 *     train be the same movement, which is the exact error being refused.
 *   - `corridorId` is explicit, never derived from `section`.
 */
export interface TrainMovementRecord {
  /** Unique to ONE run. Must differ from `trainId`. */
  movementId: string;
  /** The service this run belongs to. */
  trainId: string;
  /** Run identity as the source states it (run number, trip id, ...). */
  runIdentity: string;
  /** ISO date string (YYYY-MM-DD) of the run this movement is. */
  runDate: string;
  corridorId: string;
  section: string;
  /** ISO datetime string. Must be before `arrival`. */
  departure: string;
  /** ISO datetime string. Must be after `departure`. */
  arrival: string;
  direction: DirectionType;
}

/**
 * The authoritative source of {@link TrainMovementRecord}s.
 *
 * Deliberately left unimplemented. No Module 4 store satisfies this, and adding
 * one over mock trains is exactly the fabrication Decision D refuses; readiness
 * reports the absence instead, and `resolvableByUserAction` stays `false`
 * because no amount of operator input in this application creates a movement.
 */
export interface MovementRegister {
  readonly movements: readonly TrainMovementRecord[];
}

export interface GoodsForecast {
  forecastId: string;
  sectionId: string;
  corridorId?: string;
  expectedTime: string; // ISO datetime string
  /**
   * Module 3 `GoodsForecast.window_start` / `window_end` (a start/end pair).
   *
   * `expectedTime` is a point estimate and is NOT used to synthesise a window:
   * a window of zero width would claim a certainty the forecast does not have.
   * Both ends are optional, and a half-populated window counts as missing
   * rather than being completed from `expectedTime`.
   */
  windowStart?: string;
  windowEnd?: string;
  /**
   * Module 3 `GoodsForecast.volume_tonnes`.
   *
   * Distinct from `probability`: how likely freight is, and how much of it.
   * One does not imply the other, so this is never inferred from `probability`.
   */
  volumeTonnes?: number;
  probability: number;  // Probability range 0.0 to 1.0
  trainType: 'GOODS';
  confidence: ConfidenceLevel;
  source: ForecastSource;
  status: ForecastStatus;
}
