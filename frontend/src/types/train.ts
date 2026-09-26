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
