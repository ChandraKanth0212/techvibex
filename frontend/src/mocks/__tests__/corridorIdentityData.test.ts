/**
 * RailOpt Module 4 – Explicit Corridor Identity Data (Phase 9B-5)
 *
 * These tests lock down the one thing this phase changed: explicit corridor
 * identity and explicit corridor names now exist as literal fixture data.
 *
 * The central guarantee is negative as well as positive. `sectionId` and
 * `corridorId` happen to correspond one-to-one in the Module 4 corridor
 * register, but that correspondence is fixture authorship, not a contract.
 * Nothing in this file, and nothing in `src/`, may treat one as a way to
 * compute the other. So every expectation below is pinned as two parallel
 * literal arrays: the expected `sectionId` per record AND the expected
 * `corridorId` per record. A section-to-corridor lookup would make both
 * assertions pass for any self-consistent (and possibly wrong) assignment;
 * pinned arrays cannot.
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
import type { Corridor } from '@/types/corridor';
import { buildCorridorTopology, resolveCorridorIdentity } from '@/utils/corridorIdentity';
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

/** The six readiness inputs this phase is responsible for. */
const PHASE_INPUTS = [
  'tasks.corridor_id',
  'block_requests.corridor_id',
  'assets.corridor_id',
  'trains.corridor_id',
  'goods_forecasts.corridor_id',
  'corridors.name',
] as const;

/**
 * The five blocking inputs still outstanding after Phase 9B-5. Phase 9B-6
 * resolved four more; these are what remain.
 */
const REMAINING_BLOCKERS = [
  'tasks.priority',
  'request.occupancy_type',
  'trains.movement_id',
  'corridors.sections',
  'resources.resource_type',
] as const;

interface PinnedCollection {
  readonly name: string;
  readonly file: string;
  /** `[sectionId, corridorId]` in fixture order. */
  readonly records: ReadonlyArray<readonly [sectionId: string, corridorId: string]>;
}

/**
 * Pinned expectations, written out in full and in order. `sectionId` is the
 * pre-Phase-9B-5 value (proving it was not touched to make the relationship
 * work) and `corridorId` is the literal added by this phase.
 */
const PINNED: readonly PinnedCollection[] = [
  {
    name: 'maintenanceTasks',
    file: 'maintenanceTasks.ts',
    records: [
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-LPI-HYB', 'CORR-005'],
    ],
  },
  {
    name: 'blockRequests',
    file: 'blockRequests.ts',
    records: [
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-LPI-HYB', 'CORR-005'],
    ],
  },
  {
    name: 'assets',
    file: 'assets.ts',
    records: [
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-LPI-HYB', 'CORR-005'],
    ],
  },
  {
    name: 'trains',
    file: 'trains.ts',
    records: [
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-LPI-HYB', 'CORR-005'],
    ],
  },
  {
    name: 'goodsForecasts',
    file: 'goodsForecasts.ts',
    records: [
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-BMT-FM', 'CORR-003'],
      ['SEC-LPI-HYB', 'CORR-005'],
      ['SEC-SCD-KCG', 'CORR-001'],
      ['SEC-LPI-MBNR', 'CORR-002'],
      ['SEC-KCG-DR', 'CORR-004'],
      ['SEC-BMT-FM', 'CORR-003'],
    ],
  },
];

const CORRIDOR_NAME_BY_ID: Readonly<Record<string, string>> = {
  'CORR-001': 'Secunderabad-Kacheguda Suburban Main Line',
  'CORR-002': 'Lingampalli-Mahbubnagar Down Freight Line',
  'CORR-003': 'Begumpet-Falaknuma Single Line',
  'CORR-004': 'Kacheguda-DR Junction Coal Freight Corridor',
  'CORR-005': 'Lingampalli-Hyderabad Deccan MMTS Section',
};

/** Pre-Phase-9B-5 corridor sectionIds, pinned. */
const PINNED_CORRIDOR_SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['CORR-001', 'SEC-SCD-KCG'],
  ['CORR-002', 'SEC-LPI-MBNR'],
  ['CORR-003', 'SEC-BMT-FM'],
  ['CORR-004', 'SEC-KCG-DR'],
  ['CORR-005', 'SEC-LPI-HYB'],
];

const RECORDS_BY_NAME: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>> = {
  maintenanceTasks: mockMaintenanceTasks as never,
  blockRequests: mockBlockRequests as never,
  assets: mockAssets as never,
  trains: mockTrains as never,
  goodsForecasts: mockGoodsForecasts as never,
};

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

/** Readiness with a corridor and one in-corridor task selected. */
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

describe('Phase 9B-5: explicit corridor identity data', () => {
  describe('referential integrity', () => {
    for (const collection of PINNED) {
      it(`every ${collection.name} corridorId exists in the corridor catalogue`, () => {
        const records = RECORDS_BY_NAME[collection.name];
        expect(records).toHaveLength(collection.records.length);

        const unknown = records
          .map((r, i) => ({ i, corridorId: r.corridorId as string }))
          .filter((r) => !catalogIds.has(r.corridorId));
        expect(unknown, `${collection.name} has corridorIds not in the catalogue`).toEqual([]);
      });

      it(`every ${collection.name} record carries explicit corridor identity`, () => {
        for (const record of RECORDS_BY_NAME[collection.name]) {
          expect(typeof record.corridorId).toBe('string');
          expect((record.corridorId as string).trim()).not.toBe('');
          expect(typeof record.sectionId).toBe('string');
        }
      });

      it(`${collection.name} corridorId is a literal in the source, not a computed value`, () => {
        const source = readFileSync(join(MOCKS_DIR, collection.file), 'utf8');
        // Split on lines rather than using `\s*` in a multiline regex: `\s`
        // matches newlines and backtracks, which makes negative lookaheads on
        // indented property lines silently unreliable.
        const assignments = source
          .split(/\r?\n/)
          .filter((line) => /^[ \t]*corridorId:/.test(line));

        expect(assignments).toHaveLength(collection.records.length);
        for (const line of assignments) {
          expect(line, `${collection.file} must not compute corridorId`).toMatch(
            /^[ \t]*corridorId: 'CORR-\d{3}',$/,
          );
        }
      });
    }

    it('every populated corridorId resolves as MAPPED_FROM_MODULE_4, never as a section lookup', () => {
      const topology = buildCorridorTopology(mockCorridors);
      for (const collection of PINNED) {
        for (const record of RECORDS_BY_NAME[collection.name]) {
          const identity = resolveCorridorIdentity(
            { sectionId: record.sectionId as string, corridorId: record.corridorId as string },
            topology,
          );
          expect(identity.source).toBe('MAPPED_FROM_MODULE_4');
          expect(identity.corridorId).toBe(record.corridorId);
          // The section-based candidate must stay unused even when it would match.
          expect(identity.candidateCorridorId).toBeNull();
        }
      }
    });
  });

  describe('corridor names', () => {
    it('every corridor has a non-empty name', () => {
      for (const corridor of mockCorridors) {
        expect(typeof corridor.name).toBe('string');
        expect((corridor.name ?? '').trim().length).toBeGreaterThan(0);
      }
    });

    it('corridor names are the pinned explicit values', () => {
      expect(mockCorridors.map((c) => [c.corridorId, c.name])).toEqual(
        PINNED_CORRIDOR_SECTIONS.map(([corridorId]) => [
          corridorId,
          CORRIDOR_NAME_BY_ID[corridorId],
        ]),
      );
    });

    it('corridor names are not assembled from station ids, corridor ids or section ids', () => {
      for (const corridor of mockCorridors) {
        const name = corridor.name ?? '';
        const from = corridor.fromStation;
        const to = corridor.toStation;

        for (const assembled of [
          `${from}-${to}`,
          `${from} - ${to}`,
          `${from} ${to}`,
          `${from} to ${to}`,
          `${from}->${to}`,
          `${from}/${to}`,
          from,
          to,
        ]) {
          expect(name, `name for ${corridor.corridorId} looks assembled`).not.toBe(assembled);
        }
        expect(name).not.toContain(corridor.corridorId);
        expect(name).not.toContain(corridor.sectionId);
      }
    });
  });

  describe('sectionId integrity', () => {
    it('corridor sectionIds are unchanged', () => {
      expect(mockCorridors.map((c) => [c.corridorId, c.sectionId])).toEqual(
        PINNED_CORRIDOR_SECTIONS.map((p) => [...p]),
      );
    });

    for (const collection of PINNED) {
      it(`${collection.name} sectionIds are byte-identical to the pre-9B-5 fixture`, () => {
        const actual = RECORDS_BY_NAME[collection.name].map((r) => r.sectionId);
        const expected = collection.records.map((p) => p[0]);
        expect(actual).toEqual(expected);
      });
    }
  });

  describe('no derivation of corridorId from sectionId', () => {
    it('no source file assigns a corridorId from a sectionId', () => {
      // The anti-pattern: the right-hand side of a corridorId assignment (or
      // the argument passed to it) mentions sectionId.
      const derivation = /corridorId\s*(?::[^;{}=,]*=|=\s*)[^;{}\n]*sectionId/;
      const offenders: string[] = [];

      for (const file of listSourceFiles(SRC_ROOT)) {
        const source = readFileSync(file, 'utf8');
        if (derivation.test(source)) {
          offenders.push(file.slice(SRC_ROOT.length + 1));
        }
      }
      expect(offenders, 'corridorId must never be computed from sectionId').toEqual([]);
    });

    it('only the dedicated utility may reason section-to-corridor, and it refuses to convert', () => {
      // `corridorIdentity.ts` is the one place permitted to hold a section
      // index, and it deliberately returns `corridorId: null` for a
      // section-only entity. No other module may build or consume one.
      const offenders: string[] = [];
      for (const file of listSourceFiles(SRC_ROOT)) {
        const rel = file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
        // Allowed: the utility itself, its type declaration, and tests.
        if (rel === 'utils/corridorIdentity.ts') continue;
        if (rel === 'types/corridorIdentity.ts') continue;
        if (rel.includes('__tests__/')) continue;
        if (readFileSync(file, 'utf8').includes('bySectionId')) offenders.push(rel);
      }
      expect(offenders, 'no production module may index corridors by sectionId').toEqual([]);

      // And within the utility itself, a section lookup must never be the
      // assigned corridorId: it is only ever offered as a candidate.
      const utility = readFileSync(
        join(SRC_ROOT, 'utils', 'corridorIdentity.ts'),
        'utf8',
      );
      const candidateAssignments = utility.match(/corridorId:\s*([^,\n]+)/g) ?? [];
      for (const assignment of candidateAssignments) {
        expect(assignment, 'utility must not assign a section-derived corridorId').not.toMatch(
          /candidate|claimant|section/i,
        );
      }
    });

    it('a record with only a sectionId still yields no corridor identity', () => {
      const topology = buildCorridorTopology(mockCorridors);
      const corridor = mockCorridors[0];
      const identity = resolveCorridorIdentity({ sectionId: corridor.sectionId }, topology);

      // This is the load-bearing assertion: the shortcut that would make this
      // whole phase unnecessary must remain impossible.
      expect(identity.corridorId).toBeNull();
      expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
      expect(identity.candidateCorridorId).toBe(corridor.corridorId);
    });
  });

  describe('provenance', () => {
    it('no synthetic provenance token appears in the corridor identity fixtures', () => {
      const files = [...PINNED.map((c) => c.file), 'corridors.ts'];
      for (const file of files) {
        const source = readFileSync(join(MOCKS_DIR, file), 'utf8');
        expect(source, `${file} must not claim synthetic provenance`).not.toContain(
          'MODULE_3_SYNTHETIC_DEMO',
        );
        expect(source, `${file} must not claim synthetic provenance`).not.toContain(
          'SYNTHETIC_DEMO',
        );
      }
    });

    it('all six phase inputs report MAPPED_FROM_MODULE_4 provenance', () => {
      const readiness = assessModule4Readiness(scopedSnapshot(baselineScope()));
      expect(readiness.dataMode).toBe('MODULE_4');

      for (const id of PHASE_INPUTS) {
        const input = inputOf(readiness, id);
        expect(input.source, `${id} provenance`).toBe('MAPPED_FROM_MODULE_4');
        expect(input.synthetic, `${id} must not be synthetic`).toBe(false);
      }
    });
  });

  describe('determinism', () => {
    it('corridor identity sequences are pinned and stable across module loads', () => {
      for (const collection of PINNED) {
        const first = RECORDS_BY_NAME[collection.name].map((r) => [r.sectionId, r.corridorId]);
        const second = RECORDS_BY_NAME[collection.name].map((r) => [r.sectionId, r.corridorId]);
        expect(first).toEqual(second);
        expect(first).toEqual(collection.records.map((p) => [...p]));
      }
    });

    it('repeated readiness assessment yields identical results', () => {
      const a = assessModule4Readiness(scopedSnapshot(baselineScope()));
      const b = assessModule4Readiness(scopedSnapshot(baselineScope()));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  describe('no mutation', () => {
    it('assessing readiness does not mutate the mock records', () => {
      const before = JSON.stringify({
        tasks: mockMaintenanceTasks,
        blockRequests: mockBlockRequests,
        assets: mockAssets,
        trains: mockTrains,
        goodsForecasts: mockGoodsForecasts,
        corridors: mockCorridors,
      });
      assessModule4Readiness(scopedSnapshot(baselineScope()));
      const after = JSON.stringify({
        tasks: mockMaintenanceTasks,
        blockRequests: mockBlockRequests,
        assets: mockAssets,
        trains: mockTrains,
        goodsForecasts: mockGoodsForecasts,
        corridors: mockCorridors,
      });
      expect(after).toBe(before);
    });

    it('resolving corridor identity does not mutate the entity or the corridor register', () => {
      const topology = buildCorridorTopology(mockCorridors);
      const before = JSON.stringify({ tasks: mockMaintenanceTasks, corridors: mockCorridors });
      for (const record of mockMaintenanceTasks) {
        resolveCorridorIdentity(
          { sectionId: record.sectionId, corridorId: record.corridorId },
          topology,
        );
      }
      expect(JSON.stringify({ tasks: mockMaintenanceTasks, corridors: mockCorridors })).toBe(
        before,
      );
    });
  });

  describe('readiness effect', () => {
    it('all six corridor identity inputs are AVAILABLE', () => {
      const readiness = assessModule4Readiness(scopedSnapshot(baselineScope()));

      for (const id of PHASE_INPUTS) {
        const input = inputOf(readiness, id);
        expect(input.status, `${id} should be AVAILABLE`).toBe('AVAILABLE');
        if (input.coverage) {
          expect(input.coverage.present, `${id} coverage`).toBe(input.coverage.total);
        }
      }
    });

    it('the real path is still not READY and all other blockers remain blocked', () => {
      const readiness = assessModule4Readiness(scopedSnapshot(baselineScope()));

      expect(readiness.state).not.toBe('READY');
      expect(readiness.state).toBe('BLOCKED');

      const blocked = readiness.inputs
        .filter((i) => i.blocking && i.status !== 'AVAILABLE')
        .map((i) => i.id)
        .sort();
      expect(blocked).toEqual([...REMAINING_BLOCKERS].sort());
    });

    it('request scope inputs are unaffected by this phase', () => {
      const readiness = assessModule4Readiness(scopedSnapshot(baselineScope()));
      expect(inputOf(readiness, 'request.corridor_id').status).toBe('AVAILABLE');
      expect(inputOf(readiness, 'request.task_ids').status).toBe('AVAILABLE');
    });
  });
});

describe('Phase 9B-5: corridor catalogue shape', () => {
  it('corridor catalogue still has exactly five unique corridors', () => {
    expect(mockCorridors).toHaveLength(5);
    expect(new Set(mockCorridors.map((c) => c.corridorId)).size).toBe(5);
  });

  it('corridor names are unique', () => {
    const names = mockCorridors.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every corridor still declares exactly one sectionId (no fabricated topology)', () => {
    for (const corridor of mockCorridors) {
      expect(corridor.sectionId).toBeTruthy();
      expect((corridor as Corridor).sections).toBeUndefined();
    }
  });
});
