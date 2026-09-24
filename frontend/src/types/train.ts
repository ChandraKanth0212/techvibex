/**
 * RailOpt Domain Entities: Train & GoodsForecast
 * Represents scheduled train services and probabilistic freight/goods flow forecasts.
 */

export type TrainType = 'PASSENGER' | 'EXPRESS' | 'GOODS' | 'OTHER';
export type DirectionType = 'UP' | 'DOWN';
export type TrainStatus = 'SCHEDULED' | 'RUNNING' | 'DELAYED' | 'CANCELLED' | 'REROUTED';

export interface Train {
  trainId: string;
  trainNumber: string;
  trainType: TrainType;
  sectionId: string;
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
  expectedTime: string; // ISO datetime string
  probability: number;  // Probability range 0.0 to 1.0
  trainType: 'GOODS';
  confidence: ConfidenceLevel;
  source: ForecastSource;
  status: ForecastStatus;
}
