import { GoodsForecast } from '../types/train';

/**
 * RailOpt Synthetic Demo Data: Goods Freight Flow Forecasts
 * Division: SECUNDERABAD (SEC)
 * 
 * 10 probabilistic freight forecasts generated from FOIS feeds and predictive patterns.
 * Several records intentionally overlap with candidate maintenance windows (Scenario 3).
 */
export const mockGoodsForecasts: GoodsForecast[] = [
  {
    // Crucial for Scenario 3: Freight train collision with Bridge 88 maintenance window
    forecastId: 'GFC-001',
    sectionId: 'SEC-KCG-DR',
    expectedTime: '2026-09-25T02:45:00Z',
    probability: 0.82,
    trainType: 'GOODS',
    confidence: 'HIGH',
    source: 'FREIGHT_FOIS_FEED',
    status: 'PROJECTED',
  },
  {
    forecastId: 'GFC-002',
    sectionId: 'SEC-SCD-KCG',
    expectedTime: '2026-09-25T01:45:00Z',
    probability: 0.35,
    trainType: 'GOODS',
    confidence: 'LOW',
    source: 'HISTORICAL_PATTERN',
    status: 'CANCELLED', // Successfully cancelled to allow 3-department block
  },
  {
    forecastId: 'GFC-003',
    sectionId: 'SEC-LPI-MBNR',
    expectedTime: '2026-09-25T03:15:00Z',
    probability: 0.78,
    trainType: 'GOODS',
    confidence: 'HIGH',
    source: 'FREIGHT_FOIS_FEED',
    status: 'PROJECTED',
  },
  {
    forecastId: 'GFC-004',
    sectionId: 'SEC-KCG-DR',
    expectedTime: '2026-09-25T14:00:00Z',
    probability: 0.88,
    trainType: 'GOODS',
    confidence: 'HIGH',
    source: 'FREIGHT_FOIS_FEED',
    status: 'CONFIRMED',
  },
  {
    forecastId: 'GFC-005',
    sectionId: 'SEC-BMT-FM',
    expectedTime: '2026-09-25T02:15:00Z',
    probability: 0.40,
    trainType: 'GOODS',
    confidence: 'LOW',
    source: 'AI_PREDICTIVE_MODEL',
    status: 'PROJECTED',
  },
  {
    forecastId: 'GFC-006',
    sectionId: 'SEC-LPI-HYB',
    expectedTime: '2026-09-25T01:30:00Z',
    probability: 0.65,
    trainType: 'GOODS',
    confidence: 'MEDIUM',
    source: 'HISTORICAL_PATTERN',
    status: 'PROJECTED',
  },
  {
    forecastId: 'GFC-007',
    sectionId: 'SEC-SCD-KCG',
    expectedTime: '2026-09-25T23:00:00Z',
    probability: 0.70,
    trainType: 'GOODS',
    confidence: 'MEDIUM',
    source: 'FREIGHT_FOIS_FEED',
    status: 'PROJECTED',
  },
  {
    forecastId: 'GFC-008',
    sectionId: 'SEC-LPI-MBNR',
    expectedTime: '2026-09-26T02:30:00Z',
    probability: 0.85,
    trainType: 'GOODS',
    confidence: 'HIGH',
    source: 'FREIGHT_FOIS_FEED',
    status: 'PROJECTED',
  },
  {
    forecastId: 'GFC-009',
    sectionId: 'SEC-KCG-DR',
    expectedTime: '2026-09-26T03:00:00Z',
    probability: 0.90,
    trainType: 'GOODS',
    confidence: 'HIGH',
    source: 'FREIGHT_FOIS_FEED',
    status: 'CONFIRMED',
  },
  {
    forecastId: 'GFC-010',
    sectionId: 'SEC-BMT-FM',
    expectedTime: '2026-09-26T01:30:00Z',
    probability: 0.50,
    trainType: 'GOODS',
    confidence: 'MEDIUM',
    source: 'AI_PREDICTIVE_MODEL',
    status: 'PROJECTED',
  },
];
