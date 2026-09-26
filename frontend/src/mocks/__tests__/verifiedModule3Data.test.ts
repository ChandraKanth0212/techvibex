/**
 * RailOpt Module 4 – Verified Task and Forecast Fields (Phase 9B-6)
 *
 * Phase 9B-6 populates the fields whose Module 3 semantics already have a
 * dedicated Module 4 field, with no mapping decision involved:
 *
 *   MaintenanceTask.module3WorkType   (Module 3's own vocabulary, verbatim)
 *   MaintenanceTask.dueBy             (a deadline, not a request date)
 *   GoodsForecast.windowStart/End     (a window, not a point estimate)
 *   GoodsForecast.volumeTonnes        (a tonnage, not a probability)
 *
 * This matters more than a normal data-population phase, because readiness
 * validates almost none of it. It checks only:
 *   dueBy        -> Boolean(dueBy)                  (presence)
 *   window       -> Boolean(start) && Boolean(end)  (presence)
 *   volumeTonnes -> typeof === 'number' && isFinite (the only real check)
 *
 * So window ORDERING, dueBy validity and the work-type vocabulary are enforced
 * by nothing in the request path today. The work-type union is checked by
 * `tsc` at compile time, but ordering and date validity rest entirely on the
 * assertions in this file. A reversed window or a junk deadline would sail
 * through readiness and be serialised straight into a Module 3 request.
 *
 * Every value below is an authored literal. The free-text `workType`, the
 * `requestedDate`, the `expectedTime` and the `probability` on the same records
 * are semantically DIFFERENT things, and no code may turn one into the other.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import {
  mockAIRecommendations,
  mockAssets,
  mockBlockRequests,
  mockCorridors,
  mockGoodsForecasts,
  mockIntegratedBlocks,
  mockMaintenanceTasks,
  mockResources,
  mockTrains,
} from '@/mocks';
import type { OptimizerWorkType } from '@/types/optimizer';
import {
  INITIAL_PLANNER_SCOPE,
  selectPlannerCorridor,
  setPlannerTasks,
  type PlannerScope,
} from '@/utils/plannerScope';
import {
  assessModule4Readiness,
  type Module4ReadinessSnapshot,
  type OptimizerReadinessInput,
  type OptimizerRequestReadiness,
} from '@/services/optimizerRequestReadiness';

const SRC_ROOT = resolvePath(__dirname, '..', '..');
const MOCKS_DIR = resolvePath(__dirname, '..');

/** The five readiness inputs this phase is responsible for. */
const PHASE_INPUTS = [
  'tasks.work_type',
  'tasks.due_by',
  'goods_forecasts.window',
  'goods_forecasts.volume_tonnes',
] as const;

/** Blocking inputs this phase must leave untouched. */
const REMAINING_BLOCKERS = [
  'tasks.priority',
  'request.occupancy_type',
  'trains.movement_id',
  'corridors.sections',
  'resources.resource_type',
] as const;

/** Module 3's work-type vocabulary, pinned independently of the source enum. */
const PINNED_WORK_TYPES: readonly OptimizerWorkType[] = [
  'PREVENTIVE',
  'CORRECTIVE',
  'INSPECTION',
  'REPAIR',
  'REPLACEMENT',
  'UPGRADE',
];

/** `[taskId, sectionId, corridorId, module3WorkType, dueBy]` in fixture order. */
const PINNED_TASKS: ReadonlyArray<
  readonly [string, string, string, OptimizerWorkType, string]
> = [
  ['TSK-ENG-001', 'SEC-SCD-KCG', 'CORR-001', 'CORRECTIVE', '2026-09-25T06:00:00Z'],
  ['TSK-ENG-002', 'SEC-LPI-MBNR', 'CORR-002', 'CORRECTIVE', '2026-09-26T12:00:00Z'],
  ['TSK-ENG-003', 'SEC-KCG-DR', 'CORR-004', 'INSPECTION', '2026-10-02T18:00:00Z'],
  ['TSK-ENG-004', 'SEC-LPI-MBNR', 'CORR-002', 'REPLACEMENT', '2026-10-09T18:00:00Z'],
  ['TSK-ENG-005', 'SEC-SCD-KCG', 'CORR-001', 'REPAIR', '2026-10-10T18:00:00Z'],
  ['TSK-ENG-006', 'SEC-BMT-FM', 'CORR-003', 'PREVENTIVE', '2026-10-15T18:00:00Z'],
  ['TSK-ENG-007', 'SEC-SCD-KCG', 'CORR-001', 'PREVENTIVE', '2026-11-04T18:00:00Z'],
  ['TSK-ENG-008', 'SEC-LPI-HYB', 'CORR-005', 'INSPECTION', '2026-11-11T18:00:00Z'],
  ['TSK-SNT-001', 'SEC-SCD-KCG', 'CORR-001', 'REPAIR', '2026-10-05T18:00:00Z'],
  ['TSK-SNT-002', 'SEC-SCD-KCG', 'CORR-001', 'REPLACEMENT', '2026-10-01T18:00:00Z'],
  ['TSK-SNT-003', 'SEC-SCD-KCG', 'CORR-001', 'CORRECTIVE', '2026-09-30T18:00:00Z'],
  ['TSK-SNT-004', 'SEC-LPI-MBNR', 'CORR-002', 'INSPECTION', '2026-10-12T18:00:00Z'],
  ['TSK-SNT-005', 'SEC-LPI-MBNR', 'CORR-002', 'INSPECTION', '2026-10-20T18:00:00Z'],
  ['TSK-SNT-006', 'SEC-KCG-DR', 'CORR-004', 'REPLACEMENT', '2026-10-04T08:00:00Z'],
  ['TSK-SNT-007', 'SEC-BMT-FM', 'CORR-003', 'REPAIR', '2026-10-20T18:00:00Z'],
  ['TSK-SNT-008', 'SEC-LPI-HYB', 'CORR-005', 'PREVENTIVE', '2026-10-24T18:00:00Z'],
  ['TSK-TRC-001', 'SEC-SCD-KCG', 'CORR-001', 'REPAIR', '2026-09-29T18:00:00Z'],
  ['TSK-TRC-002', 'SEC-SCD-KCG', 'CORR-001', 'REPAIR', '2026-09-29T18:00:00Z'],
  ['TSK-TRC-003', 'SEC-LPI-MBNR', 'CORR-002', 'PREVENTIVE', '2026-10-25T18:00:00Z'],
  ['TSK-TRC-004', 'SEC-SCD-KCG', 'CORR-001', 'REPLACEMENT', '2026-10-06T18:00:00Z'],
  ['TSK-TRC-005', 'SEC-LPI-MBNR', 'CORR-002', 'REPAIR', '2026-10-16T18:00:00Z'],
  ['TSK-TRC-006', 'SEC-BMT-FM', 'CORR-003', 'PREVENTIVE', '2026-10-18T18:00:00Z'],
  ['TSK-TRC-007', 'SEC-KCG-DR', 'CORR-004', 'REPLACEMENT', '2026-10-11T18:00:00Z'],
  ['TSK-TRC-008', 'SEC-LPI-HYB', 'CORR-005', 'INSPECTION', '2026-11-10T18:00:00Z'],
];

/** `[forecastId, sectionId, corridorId, windowStart, windowEnd, volumeTonnes]`. */
const PINNED_FORECASTS: ReadonlyArray<
  readonly [string, string, string, string, string, number]
> = [
  ['GFC-001', 'SEC-KCG-DR', 'CORR-004', '2026-09-25T01:30:00Z', '2026-09-25T04:30:00Z', 1450],
  ['GFC-002', 'SEC-SCD-KCG', 'CORR-001', '2026-09-25T01:00:00Z', '2026-09-25T02:30:00Z', 720],
  ['GFC-003', 'SEC-LPI-MBNR', 'CORR-002', '2026-09-25T02:15:00Z', '2026-09-25T05:15:00Z', 1180],
  ['GFC-004', 'SEC-KCG-DR', 'CORR-004', '2026-09-25T12:30:00Z', '2026-09-25T16:30:00Z', 1620],
  ['GFC-005', 'SEC-BMT-FM', 'CORR-003', '2026-09-25T01:45:00Z', '2026-09-25T03:45:00Z', 860],
  ['GFC-006', 'SEC-LPI-HYB', 'CORR-005', '2026-09-25T00:45:00Z', '2026-09-25T02:45:00Z', 940],
  ['GFC-007', 'SEC-SCD-KCG', 'CORR-001', '2026-09-25T22:00:00Z', '2026-09-26T00:30:00Z', 1310],
  ['GFC-008', 'SEC-LPI-MBNR', 'CORR-002', '2026-09-26T01:00:00Z', '2026-09-26T04:00:00Z', 1520],
  ['GFC-009', 'SEC-KCG-DR', 'CORR-004', '2026-09-26T01:30:00Z', '2026-09-26T05:00:00Z', 1740],
  ['GFC-010', 'SEC-BMT-FM', 'CORR-003', '2026-09-26T00:30:00Z', '2026-09-26T02:45:00Z', 1090],
];

const catalogIds = new Set(mockCorridors.map((c) => c.corridorId));

function scopedSnapshot(scope: PlannerScope = INITIAL_PLANNER_SCOPE): Module4ReadinessSnapshot {
  return {
    tasks: mockMaintenanceTasks,
    blockRequests: mockBlockRequests,
    assets: mockAssets,
    trains: mockTrains,
    goodsForecasts: mockGoodsForecasts,
    resources: mockResources,
    corridors: mockCorridors,
    integratedBlocks: mockIntegratedBlocks,
    occupancies: [],
    recommendations: mockAIRecommendations,
    scope,
  };
}

function inputOf(readiness: OptimizerRequestReadiness, id: string): OptimizerReadinessInput {
  const found = readiness.inputs.find((i) => i.id === id);
  if (!found) throw new Error(`no readiness input "${id}"`);
  return found;
}

function baselineScope(): PlannerScope {
  return setPlannerTasks(
    selectPlannerCorridor(INITIAL_PLANNER_SCOPE, mockCorridors[0].corridorId, mockCorridors),
    ['TSK-ENG-001'],
    mockMaintenanceTasks,
  );
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** ISO-8601 datetime with an explicit `Z` offset. */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe('Phase 9B-6: verified task and forecast fields', () => {
  describe('MaintenanceTask.module3WorkType', () => {
    it('24/24 tasks carry a valid Module 3 work type', () => {
      expect(mockMaintenanceTasks).toHaveLength(24);
      for (const task of mockMaintenanceTasks) {
        expect(PINNED_WORK_TYPES, `${task.taskId} work type`).toContain(
          task.module3WorkType,
        );
      }
    });

    it('uses only the six values in the source enum, and no others', () => {
      const used = new Set(mockMaintenanceTasks.map((t) => t.module3WorkType));
      for (const value of used) {
        expect(PINNED_WORK_TYPES).toContain(value);
      }
      // The pinned list must match the declared union, so a Module 3 change
      // surfaces here instead of silently diverging.
      expect([...PINNED_WORK_TYPES].sort()).toEqual(
        [...new Set(mockMaintenanceTasks.map((t) => t.module3WorkType))]
          .concat([...PINNED_WORK_TYPES].filter((v) => !used.has(v)))
          .sort(),
      );
    });

    it('is a literal per record, in the pinned order', () => {
      expect(
        mockMaintenanceTasks.map((t) => [t.taskId, t.module3WorkType]),
      ).toEqual(PINNED_TASKS.map(([id, , , workType]) => [id, workType]));
    });

    it('is never equal to the free-text workType it was classified from', () => {
      for (const task of mockMaintenanceTasks) {
        expect(task.workType, `${task.taskId} must keep its free text`).toBeTruthy();
        // The two are different vocabularies; a copied-across value would mean
        // someone had wired a text mapping.
        expect(task.workType).not.toBe(task.module3WorkType);
      }
    });
  });

  describe('MaintenanceTask.dueBy', () => {
    it('24/24 tasks carry a parseable ISO deadline', () => {
      expect(mockMaintenanceTasks).toHaveLength(24);
      for (const task of mockMaintenanceTasks) {
        const due = task.dueBy ?? '';
        expect(due, `${task.taskId} dueBy`).toMatch(ISO_DATETIME);
        expect(Number.isFinite(Date.parse(due)), `${task.taskId} dueBy parses`).toBe(true);
      }
    });

    it('is a deadline strictly after the planned execution window', () => {
      for (const task of mockMaintenanceTasks) {
        const due = Date.parse(task.dueBy as string);
        const end = Date.parse(task.preferredEnd ?? task.preferredStart ?? '');
        if (!Number.isFinite(end)) continue;
        expect(due, `${task.taskId} must be due after its window`).toBeGreaterThan(end);
      }
    });

    it('is never the requestedDate, and never merely that date with a time', () => {
      for (const task of mockMaintenanceTasks) {
        const due = task.dueBy as string;
        expect(due, `${task.taskId} must not equal requestedDate`).not.toBe(
          task.requestedDate,
        );
        expect(
          due.startsWith(task.requestedDate),
          `${task.taskId} must not be requestedDate plus a time`,
        ).toBe(false);
      }
    });

    it('is never copied from preferredStart or preferredEnd', () => {
      for (const task of mockMaintenanceTasks) {
        const due = task.dueBy as string;
        expect(due, `${task.taskId}`).not.toBe(task.preferredStart);
        expect(due, `${task.taskId}`).not.toBe(task.preferredEnd);
      }
    });

    it('is a literal per record, in the pinned order', () => {
      expect(mockMaintenanceTasks.map((t) => [t.taskId, t.dueBy])).toEqual(
        PINNED_TASKS.map(([id, , , , dueBy]) => [id, dueBy]),
      );
    });
  });

  describe('GoodsForecast window and volume', () => {
    it('10/10 forecasts carry a complete window', () => {
      expect(mockGoodsForecasts).toHaveLength(10);
      for (const forecast of mockGoodsForecasts) {
        expect(forecast.windowStart, `${forecast.forecastId} windowStart`).toMatch(
          ISO_DATETIME,
        );
        expect(forecast.windowEnd, `${forecast.forecastId} windowEnd`).toMatch(
          ISO_DATETIME,
        );
      }
    });

    it('windowEnd is strictly after windowStart for every forecast', () => {
      for (const forecast of mockGoodsForecasts) {
        const start = Date.parse(forecast.windowStart as string);
        const end = Date.parse(forecast.windowEnd as string);
        expect(
          end,
          `${forecast.forecastId} windowEnd must be strictly after windowStart`,
        ).toBeGreaterThan(start);
      }
    });

    it('the window is wider than the point estimate it is not derived from', () => {
      for (const forecast of mockGoodsForecasts) {
        const start = forecast.windowStart as string;
        const end = forecast.windowEnd as string;
        const point = forecast.expectedTime;
        // Neither endpoint may simply be the point estimate, and the span must
        // exceed it: readiness only checks presence, so ordering and width are
        // asserted here or nowhere.
        expect(start, `${forecast.forecastId}`).not.toBe(point);
        expect(end, `${forecast.forecastId}`).not.toBe(point);
        const span = Date.parse(end) - Date.parse(start);
        expect(span, `${forecast.forecastId} window must have real duration`).toBeGreaterThan(
          0,
        );
      }
    });

    it('the window brackets the point estimate rather than replacing it', () => {
      for (const forecast of mockGoodsForecasts) {
        const start = Date.parse(forecast.windowStart as string);
        const point = Date.parse(forecast.expectedTime);
        const end = Date.parse(forecast.windowEnd as string);
        expect(point, `${forecast.forecastId}`).toBeGreaterThanOrEqual(start);
        expect(point, `${forecast.forecastId}`).toBeLessThanOrEqual(end);
      }
    });

    it('10/10 forecasts carry a finite positive tonnage', () => {
      for (const forecast of mockGoodsForecasts) {
        const volume = forecast.volumeTonnes;
        expect(typeof volume, `${forecast.forecastId} volumeTonnes`).toBe('number');
        expect(Number.isFinite(volume as number)).toBe(true);
        expect(volume as number, `${forecast.forecastId} must be positive`).toBeGreaterThan(0);
      }
    });

    it('volume is not the probability restated, nor monotonic in it', () => {
      // A tonnage read off a probability would be bounded by 1. Real rakes are
      // not. This is the check that would catch `probability * 2000`.
      for (const forecast of mockGoodsForecasts) {
        expect(forecast.volumeTonnes as number).toBeGreaterThan(1);
      }

      // And the two must not be perfectly rank-correlated, which a derivation
      // would produce. The fixtures include probability inversions on purpose.
      const byProbability = [...mockGoodsForecasts].sort(
        (a, b) => a.probability - b.probability,
      );
      const inversions = byProbability.filter(
        (f, i) => i > 0 && f.volumeTonnes as number < (byProbability[i - 1].volumeTonnes as number),
      );
      expect(
        inversions.length,
        'a probability-derived tonnage would be monotonic in probability',
      ).toBeGreaterThan(0);
    });

    it('are literals per record, in the pinned order', () => {
      expect(
        mockGoodsForecasts.map((f) => [
          f.forecastId,
          f.windowStart,
          f.windowEnd,
          f.volumeTonnes,
        ]),
      ).toEqual(PINNED_FORECASTS.map(([id, , , start, end, volume]) => [id, start, end, volume]));
    });
  });

  describe('values are explicit literals in source', () => {
    it('maintenanceTasks.ts contains 24 literal work types and 24 literal deadlines', () => {
      const lines = readFileSync(join(MOCKS_DIR, 'maintenanceTasks.ts'), 'utf8').split(/\r?\n/);

      const workTypes = lines.filter((l) => /^[ \t]*module3WorkType:/.test(l));
      expect(workTypes).toHaveLength(24);
      for (const line of workTypes) {
        expect(line).toMatch(
          /^[ \t]*module3WorkType: '(PREVENTIVE|CORRECTIVE|INSPECTION|REPAIR|REPLACEMENT|UPGRADE)',$/,
        );
      }

      const dueBys = lines.filter((l) => /^[ \t]*dueBy:/.test(l));
      expect(dueBys).toHaveLength(24);
      for (const line of dueBys) {
        expect(line).toMatch(
          /^[ \t]*dueBy: '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',$/,
        );
      }
    });

    it('goodsForecasts.ts contains 10 literal window pairs and 10 literal volumes', () => {
      const lines = readFileSync(join(MOCKS_DIR, 'goodsForecasts.ts'), 'utf8').split(/\r?\n/);

      const starts = lines.filter((l) => /^[ \t]*windowStart:/.test(l));
      const ends = lines.filter((l) => /^[ \t]*windowEnd:/.test(l));
      expect(starts).toHaveLength(10);
      expect(ends).toHaveLength(10);
      for (const line of [...starts, ...ends]) {
        expect(line).toMatch(/^[ \t]*window(Start|End): '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',$/);
      }

      const volumes = lines.filter((l) => /^[ \t]*volumeTonnes:/.test(l));
      expect(volumes).toHaveLength(10);
      for (const line of volumes) {
        expect(line).toMatch(/^[ \t]*volumeTonnes: \d+(\.\d+)?,$/);
      }
    });
  });

  describe('no forbidden derivation exists', () => {
    /** Targets and the source fields they must never be computed from. */
    const FORBIDDEN: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['module3WorkType', ['workType']],
      ['dueBy', ['requestedDate', 'preferredStart', 'preferredEnd']],
      ['windowStart', ['expectedTime']],
      ['windowEnd', ['expectedTime']],
      ['volumeTonnes', ['probability']],
    ];

    it('no production module assigns these fields from the forbidden source', () => {
      const offenders: string[] = [];

      for (const file of listSourceFiles(SRC_ROOT)) {
        const rel = file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
        if (rel.includes('__tests__/')) continue;
        if (rel === 'mocks/maintenanceTasks.ts' || rel === 'mocks/goodsForecasts.ts') {
          // Covered separately: every occurrence must be a quoted literal.
        }

        const source = readFileSync(file, 'utf8');
        for (const [target, forbiddenSources] of FORBIDDEN) {
          // Assignment or property initialiser of the target.
          const assignments = source.matchAll(
            new RegExp(`\\b${target}\\s*(?::|=|\\?\\?=)\\s*([^;\\n]*)`, 'g'),
          );
          for (const match of assignments) {
            // Strip quoted literals, prose and comments from the right-hand
            // side: only real code can derive a value.
            const rhs = match[1]
              .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '')
              .replace(/\/\/.*$/, '');
            for (const forbidden of forbiddenSources) {
              if (new RegExp(`\\b${forbidden}\\b`).test(rhs)) {
                offenders.push(`${rel}: ${target} derived from ${forbidden}`);
              }
            }
          }
        }
      }

      expect(offenders, 'forbidden derivations must not exist').toEqual([]);
    });

    it('the fixture files never compute these fields', () => {
      for (const file of ['maintenanceTasks.ts', 'goodsForecasts.ts']) {
        const lines = readFileSync(join(MOCKS_DIR, file), 'utf8').split(/\r?\n/);
        for (const line of lines) {
          for (const [target] of FORBIDDEN) {
            if (!new RegExp(`^[ \\t]*${target}\\s*:`).test(line)) continue;
            expect(line, `${file} must assign ${target} as a literal only`).toMatch(
              /^[ \t]*\w+: (?:'[^']*'|\d+(?:\.\d+)?),$/,
            );
          }
        }
      }
    });

    it('module3WorkType is only ever consumed, never computed outside the fixture', () => {
      // If a mapping or UI layer had started classifying free text, it would
      // have to reference the field. Only the fixture, the builder, readiness
      // and the two type declarations may mention it at all.
      const allowed = new Set([
        'mocks/maintenanceTasks.ts',
        'services/optimizerRequestBuilder.ts',
        'services/optimizerRequestReadiness.ts',
        'types/maintenance.ts',
        'types/optimizer.ts',
      ]);

      const referencing: string[] = [];
      for (const file of listSourceFiles(SRC_ROOT)) {
        const rel = file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
        if (rel.includes('__tests__/')) continue;
        if (readFileSync(file, 'utf8').includes('module3WorkType')) referencing.push(rel);
      }
      expect([...referencing].sort()).toEqual([...allowed].sort());
    });

    it('the free-text workType is still free text', () => {
      // Guard against a future "cleanup" that replaces the description with the
      // enum. The two fields must keep coexisting.
      const texts = new Set(mockMaintenanceTasks.map((t) => t.workType));
      expect(texts.size).toBe(24);
      for (const text of texts) {
        expect(PINNED_WORK_TYPES as readonly string[]).not.toContain(text);
      }
    });
  });

  describe('nothing was added, removed or reordered', () => {
    it('task ids and count are unchanged', () => {
      expect(mockMaintenanceTasks).toHaveLength(24);
      expect(mockMaintenanceTasks.map((t) => t.taskId)).toEqual(
        PINNED_TASKS.map(([id]) => id),
      );
    });

    it('forecast ids and count are unchanged', () => {
      expect(mockGoodsForecasts).toHaveLength(10);
      expect(mockGoodsForecasts.map((f) => f.forecastId)).toEqual(
        PINNED_FORECASTS.map(([id]) => id),
      );
    });

    it('the untouched collections are unchanged', () => {
      expect(mockBlockRequests).toHaveLength(18);
      expect(mockAssets).toHaveLength(24);
      expect(mockTrains).toHaveLength(20);
      expect(mockCorridors).toHaveLength(5);
      expect(mockIntegratedBlocks).toHaveLength(8);
      expect(mockResources).toHaveLength(13);
    });

    it('corridor identity is unchanged on both touched collections', () => {
      expect(
        mockMaintenanceTasks.map((t) => [t.taskId, t.sectionId, t.corridorId]),
      ).toEqual(PINNED_TASKS.map(([id, sectionId, corridorId]) => [id, sectionId, corridorId]));

      expect(
        mockGoodsForecasts.map((f) => [f.forecastId, f.sectionId, f.corridorId]),
      ).toEqual(
        PINNED_FORECASTS.map(([id, sectionId, corridorId]) => [id, sectionId, corridorId]),
      );
    });

    it('every corridorId still references the corridor catalogue', () => {
      for (const task of mockMaintenanceTasks) {
        expect(catalogIds.has(task.corridorId as string), task.taskId).toBe(true);
      }
      for (const forecast of mockGoodsForecasts) {
        expect(catalogIds.has(forecast.corridorId as string), forecast.forecastId).toBe(true);
      }
    });

    it('pre-existing semantic fields are untouched', () => {
      for (const task of mockMaintenanceTasks) {
        expect(task.workType, `${task.taskId}`).toBeTruthy();
        expect(task.requestedDate, `${task.taskId}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(task.preferredStart, `${task.taskId}`).toBeTruthy();
        expect(task.department, `${task.taskId}`).toBeTruthy();
      }
      for (const forecast of mockGoodsForecasts) {
        expect(forecast.expectedTime, forecast.forecastId).toBeTruthy();
        expect(typeof forecast.probability, forecast.forecastId).toBe('number');
        expect(forecast.source, forecast.forecastId).toBeTruthy();
        expect(forecast.status, forecast.forecastId).toBeTruthy();
      }
    });

    it('mock provenance is unchanged: no synthetic label introduced', () => {
      for (const file of ['maintenanceTasks.ts', 'goodsForecasts.ts']) {
        const source = readFileSync(join(MOCKS_DIR, file), 'utf8');
        expect(source, `${file} must not claim synthetic provenance`).not.toContain(
          'MODULE_3_SYNTHETIC_DEMO',
        );
      }
    });
  });

  describe('readiness effect', () => {
    it('the four readiness inputs behind the five fields are AVAILABLE', () => {
      const readiness = assessModule4Readiness(scopedSnapshot(baselineScope()));

      for (const id of PHASE_INPUTS) {
        const input = inputOf(readiness, id);
        expect(input.status, `${id} should be AVAILABLE`).toBe('AVAILABLE');
        expect(input.source, `${id} provenance`).toBe('MAPPED_FROM_MODULE_4');
        expect(input.synthetic, `${id} must not be synthetic`).toBe(false);
        expect(input.coverage?.present, `${id} coverage`).toBe(input.coverage?.total);
      }
    });

    it('the real path remains BLOCKED with exactly the five expected blockers', () => {
      const readiness = assessModule4Readiness(scopedSnapshot(baselineScope()));

      expect(readiness.state).toBe('BLOCKED');
      const blocked = readiness.inputs
        .filter((i) => i.blocking && i.status !== 'AVAILABLE')
        .map((i) => i.id)
        .sort();
      expect(blocked).toEqual([...REMAINING_BLOCKERS].sort());
    });

    it('the mappings this phase refused to make are still refused', () => {
      const readiness = assessModule4Readiness(scopedSnapshot(baselineScope()));

      for (const id of ['tasks.priority', 'request.occupancy_type', 'resources.resource_type']) {
        const input = inputOf(readiness, id);
        expect(input.status, `${id} must stay blocked`).not.toBe('AVAILABLE');
      }
      // Inventing movement ids or corridor topology was out of scope.
      expect(inputOf(readiness, 'trains.movement_id').status).not.toBe('AVAILABLE');
      expect(inputOf(readiness, 'corridors.sections').status).not.toBe('AVAILABLE');
    });
  });
});
