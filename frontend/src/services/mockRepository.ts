/**
 * RailOpt Module 4 – Mock Repository (Data Access Layer)
 * Division: SECUNDERABAD (SEC)
 *
 * Centralises all access to synthetic mock datasets.
 * Services import from here; UI never imports mocks directly.
 *
 * Design contract:
 *   - All arrays are treated as immutable read sources
 *   - In-memory mutation state is managed separately in mockStore.ts
 *   - Every function returns a Promise to mirror a real async API
 */

import {
  mockAssets,
  mockDefects,
  mockMaintenanceTasks,
  mockBlockRequests,
  mockCorridors,
  mockTrains,
  mockGoodsForecasts,
  mockResources,
  mockIntegratedBlocks,
  mockConflicts,
  mockAIRecommendations,
  mockAuditEvents,
  mockSchedules,
  mockDashboardMetrics,
} from '@/mocks';

/** Simulated async delay (ms) – keeps prototype feel realistic */
const MOCK_DELAY = 120;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY));
}

// ── Dataset accessors ─────────────────────────────────────────────────────────

export const mockRepository = {
  getAssets:              () => delay([...mockAssets]),
  getDefects:             () => delay([...mockDefects]),
  getMaintenanceTasks:    () => delay([...mockMaintenanceTasks]),
  getBlockRequests:       () => delay([...mockBlockRequests]),
  getCorridors:           () => delay([...mockCorridors]),
  getTrains:              () => delay([...mockTrains]),
  getGoodsForecasts:      () => delay([...mockGoodsForecasts]),
  getResources:           () => delay([...mockResources]),
  getIntegratedBlocks:    () => delay([...mockIntegratedBlocks]),
  getConflicts:           () => delay([...mockConflicts]),
  getAIRecommendations:   () => delay([...mockAIRecommendations]),
  getAuditEvents:         () => delay([...mockAuditEvents]),
  getSchedules:           () => delay([...mockSchedules]),
  getDashboardMetrics:    () => delay({ ...mockDashboardMetrics }),
};
