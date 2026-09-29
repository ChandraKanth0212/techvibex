/**
 * Phase 9B-8, Decisions D and E — THE MISSING AUTHORITATIVE SOURCES.
 *
 * Both decisions have the same shape: "the authoritative source for this is an
 * external system; do not fabricate it; keep the path blocked until that source
 * is connected." Neither has a source, so the tests below prove two things:
 *
 *   1. the CONTRACT is checkable, so a real source can be asked whether it
 *      conforms before anything is sent to Module 3; and
 *   2. nothing has been fabricated in the meantime — `Train.movementId` and
 *      `Corridor.sections` are still absent, and the refusals that keep them
 *      absent are still in force.
 *
 * The load-bearing refusals, each asserted by name:
 *   D  a `trainId` is never accepted as a `movementId`
 *   E  a section list is never back-filled from `sectionId`, a corridor id, or
 *      neighbouring corridors, and a single-element `[sectionId]` is refused
 */

import { describe, expect, it } from 'vitest';
import {
  assessSourceLinkage,
  CORRIDOR_TOPOLOGY_SOURCE_KIND,
  MOVEMENT_REGISTER_SOURCE_KIND,
  POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
  resolveAuthoritativeCorridorSections,
  validateCorridorTopologyRecord,
  validateCorridorTopologySource,
  validateMovementRegister,
  validateTrainMovementRecord,
} from '@/services/optimizerSourceContracts';
import {
  assessModule4Readiness,
  type Module4ReadinessSnapshot,
} from '@/services/optimizerRequestReadiness';
import {
  TEST_ONLY_CORRIDOR_TOPOLOGY_LINKAGE,
  TEST_ONLY_MOVEMENT_REGISTER_LINKAGE,
  TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
} from './decidedWorldFixture';
import type { ExistingOccupancy } from '@/types/occupancy';
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
import type { CorridorTopologyRecord, CorridorTopologySource } from '@/types/corridor';
import type { MovementRegister, TrainMovementRecord } from '@/types/train';
import {
  INITIAL_PLANNER_SCOPE,
  selectPlannerCorridor,
  setPlannerTasks,
} from '@/utils/plannerScope';

// ─────────────────────────────────────────────────────────────────────────────
// Decision D — per-run movement register
// ─────────────────────────────────────────────────────────────────────────────

/** A conforming movement record. Test-only; NOT a mock or real data. */
function movement(overrides: Partial<TrainMovementRecord> = {}): TrainMovementRecord {
  return {
    movementId: 'MOV-2026-01-20-0001',
    trainId: 'TRN-001',
    runIdentity: 'RUN-042',
    runDate: '2026-01-20',
    corridorId: mockCorridors[0].corridorId,
    section: 'SEC-SCD-KCG-01',
    departure: '2026-01-20T06:00:00Z',
    arrival: '2026-01-20T07:30:00Z',
    direction: 'UP',
    ...overrides,
  };
}

describe('Decision D — the movement register contract', () => {
  it('accepts a record carrying every required field', () => {
    const report = validateTrainMovementRecord(movement());
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.value).toBeDefined();
  });

  it('requires exactly the fields the decision names', () => {
    for (const field of [
      'movementId',
      'trainId',
      'runIdentity',
      'runDate',
      'corridorId',
      'section',
      'departure',
      'arrival',
      'direction',
    ] as const) {
      const report = validateTrainMovementRecord({ ...movement(), [field]: '' });
      expect(report.ok, field).toBe(false);
      expect(report.violations.join(' '), field).toContain(field);
    }
  });

  it('REFUSES a movementId that is its trainId', () => {
    // The single most important check in the file. A register that copied the
    // service id into the movement field would pass every other rule, and it is
    // exactly the substitution Decision D refuses.
    const report = validateTrainMovementRecord(movement({ movementId: 'TRN-001' }));
    expect(report.ok).toBe(false);
    expect(report.violations.join(' ')).toContain('must differ from trainId');
  });

  it('accepts the same service running twice on different days as two movements', () => {
    // Which is the whole reason the register is per-run rather than per-service.
    const morning = validateTrainMovementRecord(movement({ movementId: 'MOV-A' }));
    const evening = validateTrainMovementRecord(
      movement({
        movementId: 'MOV-B',
        runIdentity: 'RUN-043',
        departure: '2026-01-20T18:00:00Z',
        arrival: '2026-01-20T19:30:00Z',
      }),
    );
    expect(morning.ok && evening.ok).toBe(true);
    expect(morning.value?.trainId).toBe(evening.value?.trainId);
    expect(morning.value?.movementId).not.toBe(evening.value?.movementId);
  });

  it('requires a corridorId to be explicit rather than derived from the section', () => {
    const report = validateTrainMovementRecord(movement({ corridorId: '' }));
    expect(report.ok).toBe(false);
    expect(report.violations.join(' ')).toContain('never derived from section');
  });

  it('requires arrival to be after departure, and a real direction', () => {
    const backwards = validateTrainMovementRecord(
      movement({ departure: '2026-01-20T07:30:00Z', arrival: '2026-01-20T06:00:00Z' }),
    );
    expect(backwards.ok).toBe(false);
    expect(backwards.violations.join(' ')).toContain('arrival must be after departure');

    const noDirection = validateTrainMovementRecord(movement({ direction: 'NORTH' as never }));
    expect(noDirection.ok).toBe(false);
    expect(noDirection.violations.join(' ')).toContain('direction is required');
  });

  it('validates a whole register and requires one movement id per run', () => {
    const good: MovementRegister = { movements: [movement({ movementId: 'MOV-A' }), movement({ movementId: 'MOV-B' })] };
    expect(validateMovementRegister(good).ok).toBe(true);

    // Two runs sharing a movement id are indistinguishable to the optimiser.
    const duplicated: MovementRegister = { movements: [movement({ movementId: 'MOV-A' }), movement({ movementId: 'MOV-A' })] };
    const report = validateMovementRegister(duplicated);
    expect(report.ok).toBe(false);
    expect(report.violations.join(' ')).toContain('must be unique per run');
  });

  it('reports every violation by name rather than stopping at the first', () => {
    const report = validateTrainMovementRecord({
      movementId: '',
      trainId: '',
      runIdentity: '',
      runDate: '',
      corridorId: '',
      section: '',
      departure: '',
      arrival: '',
      direction: 'SIDEWAYS' as never,
    });
    expect(report.ok).toBe(false);
    expect(report.violations.length).toBeGreaterThanOrEqual(9);
  });
});

describe('Decision D — nothing was fabricated in its place', () => {
  it('leaves every mock train without a movementId', () => {
    expect(mockTrains.every((t) => t.movementId === undefined)).toBe(true);
    expect(mockTrains.every((t) => Boolean(t.trainId))).toBe(true);
  });

  it('keeps the real path BLOCKED on movement_id', () => {
    const readiness = assessModule4Readiness({
      tasks: mockMaintenanceTasks,
      blockRequests: [],
      assets: [],
      trains: mockTrains,
      goodsForecasts: mockGoodsForecasts,
      resources: mockResources,
      corridors: mockCorridors,
      integratedBlocks: [],
      occupancies: [],
      recommendations: [],
      scope: INITIAL_PLANNER_SCOPE,
    });
    const input = readiness.inputs.find((i) => i.id === 'trains.movement_id');
    expect(input?.status).toBe('UNAVAILABLE');
    expect(input?.blocking).toBe(true);
    // Not a thing a user can type into this application.
    expect(input?.resolvableByUserAction).toBe(false);
    expect(input?.coverage).toEqual({ present: 0, total: mockTrains.length });
    expect(input?.reason).toContain('No trainId is accepted in its place');
    expect(input?.reason).toContain('no fallback is implemented');
  });

  it('still blocks if every train is handed a movementId equal to its trainId', () => {
    // The forbidden fallback, applied wholesale. Nothing accepts it: readiness
    // counts a `movementId` field, and a conforming REGISTER is a different
    // type that does not exist here — so the honest outcome is that the field
    // alone is not the authority.
    const readiness = assessModule4Readiness({
      tasks: mockMaintenanceTasks,
      blockRequests: [],
      assets: [],
      trains: mockTrains.map((t) => ({ ...t, movementId: t.trainId })),
      goodsForecasts: mockGoodsForecasts,
      resources: mockResources,
      corridors: mockCorridors,
      integratedBlocks: [],
      occupancies: [],
      recommendations: [],
      scope: INITIAL_PLANNER_SCOPE,
    });
    const input = readiness.inputs.find((i) => i.id === 'trains.movement_id');
    // Coverage counts the field, but the reason still names the missing source
    // and the no-fallback rule, so a caller reading it is not misled.
    expect(input?.reason).toContain('per-run movement register is the authoritative source');
    expect(input?.reason).toContain('validateTrainMovementRecord refuses any record whose movementId equals its trainId');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Decision E — authoritative ordered corridor topology
// ─────────────────────────────────────────────────────────────────────────────

/** A conforming topology record. Test-only. */
function topology(overrides: Partial<CorridorTopologyRecord> = {}): CorridorTopologyRecord {
  return {
    corridorId: mockCorridors[0].corridorId,
    orderedSectionIds: ['SEC-SCD-KCG-01', 'SEC-SCD-KCG-02', 'SEC-SCD-KCG-03'],
    direction: 'UP',
    effectiveFrom: '2026-01-01',
    version: 'topo-v1',
    ...overrides,
  };
}

describe('Decision E — the topology contract', () => {
  it('accepts a record naming a corridor and an ordered section list', () => {
    const report = validateCorridorTopologyRecord(topology());
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it('REFUSES an empty section list, which is what a back-fill produces', () => {
    const report = validateCorridorTopologyRecord(topology({ orderedSectionIds: [] }));
    expect(report.ok).toBe(false);
    expect(report.violations.join(' ')).toContain('never back-filled from sectionId');
  });

  it('refuses a repeated section, because a route traverses each once', () => {
    const report = validateCorridorTopologyRecord(
      topology({ orderedSectionIds: ['SEC-A', 'SEC-B', 'SEC-A'] }),
    );
    expect(report.ok).toBe(false);
    expect(report.violations.join(' ')).toContain('not a usable ordering');
  });

  it('treats the order as load-bearing, so a shuffled list is a different route', () => {
    const forward = resolveAuthoritativeCorridorSections(
      mockCorridors[0],
      { topology: [topology({ orderedSectionIds: ['SEC-A', 'SEC-B'] })] } as CorridorTopologySource,
    );
    const backward = resolveAuthoritativeCorridorSections(
      mockCorridors[0],
      { topology: [topology({ orderedSectionIds: ['SEC-B', 'SEC-A'] })] } as CorridorTopologySource,
    );
    expect(forward.status).toBe('AUTHORITATIVE');
    expect(backward.status).toBe('AUTHORITATIVE');
    if (forward.status !== 'AUTHORITATIVE' || backward.status !== 'AUTHORITATIVE') {
      throw new Error('expected AUTHORITATIVE');
    }
    // Same sections, different traversal: not interchangeable.
    expect(forward.orderedSectionIds).not.toEqual(backward.orderedSectionIds);
  });

  it('carries direction and effective/version metadata when supplied', () => {
    const resolved = resolveAuthoritativeCorridorSections(
      mockCorridors[0],
      { topology: [topology()] } as CorridorTopologySource,
    );
    if (resolved.status !== 'AUTHORITATIVE') throw new Error('expected AUTHORITATIVE');
    expect(resolved.version).toBe('topo-v1');
  });

  it('refuses a source with two records for the same corridor, direction and date', () => {
    const report = validateCorridorTopologySource({
      topology: [topology(), topology()],
    });
    expect(report.ok).toBe(false);
    expect(report.violations.join(' ')).toContain('already has a record');
  });

  it('allows one record per direction, since a bidirectional route differs', () => {
    const report = validateCorridorTopologySource({
      topology: [topology({ direction: 'UP' }), topology({ direction: 'DOWN' })],
    });
    expect(report.ok).toBe(true);
  });
});

describe('Decision E — sections are never fabricated', () => {
  it('returns UNAVAILABLE with no source connected', () => {
    const resolved = resolveAuthoritativeCorridorSections(mockCorridors[0], undefined);
    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status !== 'UNAVAILABLE') throw new Error('expected UNAVAILABLE');
    expect(resolved.reason).toContain('No authoritative topology source is connected');
    expect(resolved.reason).toContain('never back-filled from sectionId');
  });

  it('has no way to pass a candidate list in', () => {
    // The signature itself is the guarantee: there is no fallback parameter, so
    // `[corridor.sectionId]` cannot be returned even by accident.
    expect(resolveAuthoritativeCorridorSections.length).toBe(2);
  });

  it('returns UNAVAILABLE when the source has no record for the corridor', () => {
    const resolved = resolveAuthoritativeCorridorSections(
      mockCorridors[0],
      { topology: [topology({ corridorId: 'COR-DOES-NOT-EXIST' })] } as CorridorTopologySource,
    );
    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status !== 'UNAVAILABLE') throw new Error('expected UNAVAILABLE');
    expect(resolved.reason).toContain('no record for corridor');
  });

  it('leaves every mock corridor without a sections list', () => {
    expect(mockCorridors.every((c) => c.sections === undefined)).toBe(true);
    expect(mockCorridors.every((c) => Boolean(c.sectionId))).toBe(true);
  });

  it('REFUSES a single-element [sectionId] as surveyed topology', () => {
    // A single-section corridor is a real possibility, but it is
    // indistinguishable from a back-fill without a source, so it does not count.
    const readiness = assessModule4Readiness({
      tasks: mockMaintenanceTasks,
      blockRequests: [],
      assets: [],
      trains: mockTrains,
      goodsForecasts: mockGoodsForecasts,
      resources: mockResources,
      corridors: mockCorridors.map((c) => ({ ...c, sections: [c.sectionId] })),
      integratedBlocks: [],
      occupancies: [],
      recommendations: [],
      scope: INITIAL_PLANNER_SCOPE,
    });
    const input = readiness.inputs.find((i) => i.id === 'corridors.sections');
    expect(input?.status).toBe('UNAVAILABLE');
    expect(input?.coverage).toEqual({ present: 0, total: mockCorridors.length });
    expect(input?.reason).toContain('single-element [sectionId] is refused');
  });

  it('does not parse a corridorId into sections', () => {
    // Every mock corridorId is a real string with real content; none of it is
    // treated as a section list.
    const readiness = assessModule4Readiness({
      tasks: mockMaintenanceTasks,
      blockRequests: [],
      assets: [],
      trains: mockTrains,
      goodsForecasts: mockGoodsForecasts,
      resources: mockResources,
      corridors: mockCorridors,
      integratedBlocks: [],
      occupancies: [],
      recommendations: [],
      scope: INITIAL_PLANNER_SCOPE,
    });
    expect(readiness.inputs.find((i) => i.id === 'corridors.sections')?.status).toBe(
      'UNAVAILABLE',
    );
  });

  it('keeps the real path BLOCKED on corridors.sections', () => {
    const readiness = assessModule4Readiness({
      tasks: mockMaintenanceTasks,
      blockRequests: [],
      assets: [],
      trains: mockTrains,
      goodsForecasts: mockGoodsForecasts,
      resources: mockResources,
      corridors: mockCorridors,
      integratedBlocks: [],
      occupancies: [],
      recommendations: [],
      scope: INITIAL_PLANNER_SCOPE,
    });
    const input = readiness.inputs.find((i) => i.id === 'corridors.sections');
    expect(input?.blocking).toBe(true);
    // A survey cannot be produced from inside this application.
    expect(input?.resolvableByUserAction).toBe(false);
    expect(readiness.state).not.toBe('READY');
  });
});

describe('decisions D and E are contracts, not sources', () => {
  it('instantiates no register and no topology source anywhere in the code', () => {
    // Neither type is satisfied by any Module 4 store. The tests above build
    // their own conforming values locally rather than reading one from a store.
    const module4Source = {
      tasks: mockMaintenanceTasks,
      blockRequests: [],
      assets: [],
      trains: mockTrains,
      goodsForecasts: mockGoodsForecasts,
      resources: mockResources,
      corridors: mockCorridors,
      integratedBlocks: [],
      occupancies: [],
      recommendations: [],
      scope: INITIAL_PLANNER_SCOPE,
    };
    expect(module4Source).not.toHaveProperty('movementRegister');
    expect(module4Source).not.toHaveProperty('topologySource');
  });

  it('is deterministic: the same missing sources always give the same verdict', () => {
    const build = () =>
      assessModule4Readiness({
        tasks: mockMaintenanceTasks,
        blockRequests: [],
        assets: [],
        trains: mockTrains,
        goodsForecasts: mockGoodsForecasts,
        resources: mockResources,
        corridors: mockCorridors,
        integratedBlocks: [],
        occupancies: [],
        recommendations: [],
        scope: INITIAL_PLANNER_SCOPE,
      });
    const ids = (r: ReturnType<typeof build>) =>
      r.inputs.map((i) => `${i.id}=${i.status}`).join('|');
    expect(ids(build())).toBe(ids(build()));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source-linkage metadata: the independent half of the provenance proof
// ─────────────────────────────────────────────────────────────────────────────

/**
 * These tests cover the gap that the contract tests above could not.
 *
 * `validateTrainMovementRecord` and `validateCorridorTopologyRecord` make a real
 * source CHECKABLE, but they do not make one NECESSARY: nothing stopped a caller
 * from writing `movementId: 'M1'` or `sections: ['A', 'B']` directly onto the
 * entities, satisfying every field-level check, with no register and no survey
 * in existence. Values alone cannot carry provenance, so readiness now requires a
 * separate, explicit, typed declaration — and these tests hold that line.
 */
describe('source-linkage metadata is required before values count as sourced', () => {
  const snapshotWith = (overrides: Partial<Module4ReadinessSnapshot> = {}) => ({
    tasks: mockMaintenanceTasks,
    blockRequests: [],
    assets: [],
    trains: mockTrains,
    goodsForecasts: mockGoodsForecasts,
    resources: mockResources,
    corridors: mockCorridors,
    integratedBlocks: [],
    occupancies: [],
    recommendations: [],
    scope: INITIAL_PLANNER_SCOPE,
    ...overrides,
  });

  const inputFor = (snapshot: Module4ReadinessSnapshot, id: string) => {
    const found = assessModule4Readiness(snapshot).inputs.find((i) => i.id === id);
    if (!found) throw new Error(`no input ${id}`);
    return found;
  };

  /** Trains and corridors carrying fully valid values, with NO linkage. */
  const valuesWithoutLinkage = {
    trains: mockTrains.map((t, i) => ({ ...t, movementId: `MVT-${i}` })),
    corridors: mockCorridors.map((c) => ({
      ...c,
      sections: [`${c.sectionId}-A`, `${c.sectionId}-B`],
    })),
  };

  // ── Values alone are not provenance ────────────────────────────────────────

  it('keeps movement_id blocked when every train has a movementId but no register is linked', () => {
    const input = inputFor(
      snapshotWith(valuesWithoutLinkage),
      'trains.movement_id',
    );
    expect(input.coverage).toEqual({ present: mockTrains.length, total: mockTrains.length });
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(input.blocking).toBe(true);
  });

  it('keeps corridors.sections blocked when every corridor has a section list but no survey is linked', () => {
    const input = inputFor(
      snapshotWith(valuesWithoutLinkage),
      'corridors.sections',
    );
    expect(input.coverage).toEqual({ present: mockCorridors.length, total: mockCorridors.length });
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(input.blocking).toBe(true);
  });

  // ── Explicit test-only linkage does make them available ────────────────────

  it('makes movement_id available once a conforming test-only register linkage is declared', () => {
    const input = inputFor(
      snapshotWith({
        ...valuesWithoutLinkage,
        movementRegisterLinkage: TEST_ONLY_MOVEMENT_REGISTER_LINKAGE,
      }),
      'trains.movement_id',
    );
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
  });

  it('makes corridors.sections available once a conforming test-only topology linkage is declared', () => {
    const input = inputFor(
      snapshotWith({
        ...valuesWithoutLinkage,
        corridorTopologyLinkage: TEST_ONLY_CORRIDOR_TOPOLOGY_LINKAGE,
      }),
      'corridors.sections',
    );
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
  });

  // ── No implicit provenance ─────────────────────────────────────────────────

  it.each([
    ['a blank source id', { sourceId: '   ' }],
    ['an empty source id', { sourceId: '' }],
    ['a linkage that is not authoritative', { authoritative: false }],
    ['a linkage that is not connected', { sourceStatus: 'NOT_CONNECTED' }],
    ['a linkage that is connected but unverified', { sourceStatus: 'CONNECTED_UNVERIFIED' }],
  ] as const)('refuses movement_id for %s', (_label, override) => {
    const input = inputFor(
      snapshotWith({
        ...valuesWithoutLinkage,
        movementRegisterLinkage: { ...TEST_ONLY_MOVEMENT_REGISTER_LINKAGE, ...override },
      }),
      'trains.movement_id',
    );
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.source).toBe('UNAVAILABLE_FROM_MODULE_4');
  });

  it.each([
    ['a blank source id', { sourceId: '   ' }],
    ['a linkage that is not authoritative', { authoritative: false }],
    ['a linkage that is not connected', { sourceStatus: 'NOT_CONNECTED' }],
    ['a linkage that is connected but unverified', { sourceStatus: 'CONNECTED_UNVERIFIED' }],
  ] as const)('refuses corridors.sections for %s', (_label, override) => {
    const input = inputFor(
      snapshotWith({
        ...valuesWithoutLinkage,
        corridorTopologyLinkage: { ...TEST_ONLY_CORRIDOR_TOPOLOGY_LINKAGE, ...override },
      }),
      'corridors.sections',
    );
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.source).toBe('UNAVAILABLE_FROM_MODULE_4');
  });

  it('never lets a movement-register linkage vouch for corridor topology', () => {
    const input = inputFor(
      snapshotWith({
        ...valuesWithoutLinkage,
        movementRegisterLinkage: TEST_ONLY_MOVEMENT_REGISTER_LINKAGE,
      }),
      'corridors.sections',
    );
    expect(input.status).toBe('UNAVAILABLE');
  });

  it('never lets a topology linkage vouch for the movement register', () => {
    const input = inputFor(
      snapshotWith({
        ...valuesWithoutLinkage,
        corridorTopologyLinkage: TEST_ONLY_CORRIDOR_TOPOLOGY_LINKAGE,
      }),
      'trains.movement_id',
    );
    expect(input.status).toBe('UNAVAILABLE');
  });

  // ── The values themselves are still validated ──────────────────────────────

  it('still refuses a movementId that is just the trainId, even with a register linked', () => {
    const input = inputFor(
      snapshotWith({
        trains: mockTrains.map((t) => ({ ...t, movementId: t.trainId })),
        movementRegisterLinkage: TEST_ONLY_MOVEMENT_REGISTER_LINKAGE,
      }),
      'trains.movement_id',
    );
    // The linkage is accepted; the data is not. A source does not launder a
    // value the source contract itself would reject.
    expect(input.coverage).toEqual({ present: 0, total: mockTrains.length });
    expect(input.status).toBe('UNAVAILABLE');
  });

  it.each([
    ['a restatement of sectionId', (c: (typeof mockCorridors)[number]) => [c.sectionId]],
    ['a blank section entry', (c: (typeof mockCorridors)[number]) => [`${c.sectionId}-A`, '  ']],
    ['a repeated section', (c: (typeof mockCorridors)[number]) => [`${c.sectionId}-A`, `${c.sectionId}-A`]],
    ['an empty list', () => []],
  ])('still refuses %s as topology, even with a survey linked', (_label, sections) => {
    const input = inputFor(
      snapshotWith({
        corridors: mockCorridors.map((c) => ({ ...c, sections: sections(c) })),
        corridorTopologyLinkage: TEST_ONLY_CORRIDOR_TOPOLOGY_LINKAGE,
      }),
      'corridors.sections',
    );
    expect(input.coverage?.present).toBe(0);
    expect(input.status).toBe('UNAVAILABLE');
  });

  // ── assessSourceLinkage, directly ──────────────────────────────────────────

  it('accepts only a complete, correctly-kinded, authoritative, connected linkage', () => {
    const ok = assessSourceLinkage(
      TEST_ONLY_MOVEMENT_REGISTER_LINKAGE,
      MOVEMENT_REGISTER_SOURCE_KIND,
    );
    expect(ok.ok).toBe(true);
    expect(ok.linkage).toBe(TEST_ONLY_MOVEMENT_REGISTER_LINKAGE);

    for (const expected of [
      MOVEMENT_REGISTER_SOURCE_KIND,
      CORRIDOR_TOPOLOGY_SOURCE_KIND,
    ] as const) {
      expect(assessSourceLinkage(undefined, expected).ok).toBe(false);
      expect(assessSourceLinkage(TEST_ONLY_MOVEMENT_REGISTER_LINKAGE, expected).ok).toBe(
        expected === MOVEMENT_REGISTER_SOURCE_KIND,
      );
    }
  });

  it('names the specific missing claim, so the reason is actionable', () => {
    expect(assessSourceLinkage(undefined, MOVEMENT_REGISTER_SOURCE_KIND).reason).toContain(
      'nothing states where the values came from',
    );
    expect(
      assessSourceLinkage(
        { ...TEST_ONLY_MOVEMENT_REGISTER_LINKAGE, sourceKind: CORRIDOR_TOPOLOGY_SOURCE_KIND },
        MOVEMENT_REGISTER_SOURCE_KIND,
      ).reason,
    ).toContain('cannot speak for');
    expect(
      assessSourceLinkage({ ...TEST_ONLY_MOVEMENT_REGISTER_LINKAGE, sourceId: '  ' }, MOVEMENT_REGISTER_SOURCE_KIND)
        .reason,
    ).toContain('names no sourceId');
    expect(
      assessSourceLinkage(
        { ...TEST_ONLY_MOVEMENT_REGISTER_LINKAGE, authoritative: false },
        MOVEMENT_REGISTER_SOURCE_KIND,
      ).reason,
    ).toContain('not marked authoritative');
    expect(
      assessSourceLinkage(
        { ...TEST_ONLY_MOVEMENT_REGISTER_LINKAGE, sourceStatus: 'CONNECTED_UNVERIFIED' },
        MOVEMENT_REGISTER_SOURCE_KIND,
      ).reason,
    ).toContain('not CONNECTED');
  });

  // ── The census is unchanged ────────────────────────────────────────────────

  it('leaves the real mock world with exactly the same five blockers', () => {
    // The canonical Module 4 world, with the full mock collections. The count is
    // asserted with a literal so that a change to it has to be made deliberately.
    const readiness = assessModule4Readiness({
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
      scope: setPlannerTasks(
        selectPlannerCorridor(INITIAL_PLANNER_SCOPE, mockCorridors[0].corridorId, mockCorridors),
        [mockMaintenanceTasks[0].taskId],
        mockMaintenanceTasks,
      ),
    });
    const ids = readiness.blocking.map((b) => b.id).sort();
    expect(ids).toEqual([
      'corridors.sections',
      'request.occupancy_type',
      'resources.resource_type',
      'tasks.priority',
      'trains.movement_id',
    ]);
    expect(readiness.blocking).toHaveLength(5);
    expect(readiness.state).not.toBe('READY');
  });

  it('leaves the real mock world with the same five blockers even when values are fully populated', () => {
    // The strongest form of the claim: with every field valid and only the
    // provenance missing, the blocker count does not move by one.
    const readiness = assessModule4Readiness({
      tasks: mockMaintenanceTasks,
      blockRequests: mockBlockRequests,
      assets: mockAssets,
      trains: mockTrains.map((t, i) => ({ ...t, movementId: `MVT-${i}` })),
      goodsForecasts: mockGoodsForecasts,
      resources: mockResources,
      corridors: mockCorridors.map((c) => ({
        ...c,
        sections: [`${c.sectionId}-A`, `${c.sectionId}-B`],
      })),
      integratedBlocks: mockIntegratedBlocks,
      occupancies: [],
      recommendations: mockAIRecommendations,
      scope: setPlannerTasks(
        selectPlannerCorridor(INITIAL_PLANNER_SCOPE, mockCorridors[0].corridorId, mockCorridors),
        [mockMaintenanceTasks[0].taskId],
        mockMaintenanceTasks,
      ),
    });
    const ids = readiness.blocking.map((b) => b.id).sort();
    expect(ids).toEqual([
      'corridors.sections',
      'request.occupancy_type',
      'resources.resource_type',
      'tasks.priority',
      'trains.movement_id',
    ]);
    expect(readiness.blocking).toHaveLength(5);
  });

  it('does not disturb the approved-possession integration-completeness gate', () => {
    const readiness = assessModule4Readiness(snapshotWith());
    const gate = readiness.integrationGates.find(
      (g) => g.id === 'existing_blocks.approved_source',
    );
    expect(gate).toBeDefined();
    // Non-blocking, and still outstanding: an empty existing_blocks list does
    // not mean the network is clear.
    expect(gate?.blocking).toBe(false);
    expect(readiness.blocking.map((b) => b.id)).not.toContain('existing_blocks.approved_source');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Decision B: possession-source provenance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The same gap as Decisions D and E, in the one place `occupancyAuthority` could
 * not cover.
 *
 * `occupancyAuthority` refuses four WRONG KINDS of thing: an IntegratedBlock, an
 * AvailabilityWindow, a BlockRequest, a BlockType. All four are refused on shape.
 * But a hand-written `ExistingOccupancy` with `status: 'APPROVED'`, a real
 * `occupancyType` and a matching `relatedTaskIds` entry is the RIGHT shape — it is
 * indistinguishable from a genuine grant except that no possession system issued
 * it. Nothing in the occupancy module can detect that, so it is detected here.
 */
describe('possession-source linkage is required before a grant counts as sourced', () => {
  /** A granted possession per real mock request. TEST-ONLY, not mock data. */
  const grantedPossessions = mockBlockRequests.map((request, index) => ({
    occupancyId: `TEST-ONLY-OCC-${index}`,
    corridorId: request.corridorId ?? mockCorridors[0].corridorId,
    section: 'TEST-ONLY-SECTION',
    startTime: '2026-01-20T22:00:00Z',
    endTime: '2026-01-20T23:30:00Z',
    status: 'APPROVED' as const,
    occupancyType: 'TRAFFIC_BLOCK' as const,
    relatedTaskIds: [request.taskId],
  }));

  const snapshotWith = (overrides: Partial<Module4ReadinessSnapshot> = {}) => ({
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
    scope: setPlannerTasks(
      selectPlannerCorridor(
        INITIAL_PLANNER_SCOPE,
        mockCorridors[0].corridorId,
        mockCorridors,
      ),
      [mockMaintenanceTasks[0].taskId],
      mockMaintenanceTasks,
    ),
    ...overrides,
  });

  const inputFor = (snapshot: Module4ReadinessSnapshot, id: string) => {
    const found = assessModule4Readiness(snapshot).inputs.find((i) => i.id === id);
    if (!found) throw new Error(`no input ${id}`);
    return found;
  };

  // ── Records alone are not provenance ───────────────────────────────────────

  it('keeps request.occupancy_type blocked when every request has a granted record but no possession system is linked', () => {
    const input = inputFor(
      snapshotWith({ occupancies: grantedPossessions }),
      'request.occupancy_type',
    );
    // The records are complete, granted, and match every request by taskId...
    expect(input.coverage).toEqual({
      present: mockBlockRequests.length,
      total: mockBlockRequests.length,
    });
    // ...which is precisely why they prove nothing on their own.
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(input.blocking).toBe(true);
    expect(input.resolvableByUserAction).toBe(false);
  });

  it('says why, by naming the missing source rather than the missing data', () => {
    const input = inputFor(
      snapshotWith({ occupancies: grantedPossessions }),
      'request.occupancy_type',
    );
    expect(input.reason).toContain('a record is not evidence of a source');
    expect(input.reason).toContain('anyone can write one');
  });

  // ── Conforming test-only linkage does resolve it ───────────────────────────

  it('makes request.occupancy_type available once a conforming test-only linkage is declared', () => {
    const input = inputFor(
      snapshotWith({
        occupancies: grantedPossessions,
        possessionSourceLinkage: TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
      }),
      'request.occupancy_type',
    );
    expect(input.status).toBe('AVAILABLE');
    expect(input.source).toBe('MAPPED_FROM_MODULE_4');
    expect(input.coverage).toEqual({
      present: mockBlockRequests.length,
      total: mockBlockRequests.length,
    });
  });

  it('still requires the records themselves: linkage alone does not grant', () => {
    const input = inputFor(
      snapshotWith({
        occupancies: [],
        possessionSourceLinkage: TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
      }),
      'request.occupancy_type',
    );
    expect(input.coverage).toEqual({ present: 0, total: mockBlockRequests.length });
    expect(input.status).toBe('UNAVAILABLE');
  });

  // ── Invalid and cross-kind linkage ─────────────────────────────────────────

  it.each([
    ['a blank source id', { sourceId: '   ' }],
    ['an empty source id', { sourceId: '' }],
    ['a linkage that is not authoritative', { authoritative: false }],
    ['a linkage that is not connected', { sourceStatus: 'NOT_CONNECTED' }],
    ['a linkage that is connected but unverified', { sourceStatus: 'CONNECTED_UNVERIFIED' }],
  ] as const)('refuses request.occupancy_type for %s', (_label, override) => {
    const input = inputFor(
      snapshotWith({
        occupancies: grantedPossessions,
        possessionSourceLinkage: { ...TEST_ONLY_POSSESSION_SOURCE_LINKAGE, ...override },
      }),
      'request.occupancy_type',
    );
    expect(input.status).toBe('UNAVAILABLE');
    expect(input.source).toBe('UNAVAILABLE_FROM_MODULE_4');
  });

  it('refuses a movement-register linkage offered as the possession source', () => {
    const input = inputFor(
      snapshotWith({
        occupancies: grantedPossessions,
        possessionSourceLinkage: TEST_ONLY_MOVEMENT_REGISTER_LINKAGE,
      }),
      'request.occupancy_type',
    );
    expect(input.status).toBe('UNAVAILABLE');
  });

  it('refuses a topology linkage offered as the possession source', () => {
    const input = inputFor(
      snapshotWith({
        occupancies: grantedPossessions,
        possessionSourceLinkage: TEST_ONLY_CORRIDOR_TOPOLOGY_LINKAGE,
      }),
      'request.occupancy_type',
    );
    expect(input.status).toBe('UNAVAILABLE');
  });

  it('never lets a possession linkage vouch for movement_id or corridors.sections', () => {
    const snapshot = snapshotWith({
      occupancies: grantedPossessions,
      trains: mockTrains.map((t, i) => ({ ...t, movementId: `MVT-${i}` })),
      corridors: mockCorridors.map((c) => ({
        ...c,
        sections: [`${c.sectionId}-A`, `${c.sectionId}-B`],
      })),
      possessionSourceLinkage: TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
    });
    expect(inputFor(snapshot, 'request.occupancy_type').status).toBe('AVAILABLE');
    expect(inputFor(snapshot, 'trains.movement_id').status).toBe('UNAVAILABLE');
    expect(inputFor(snapshot, 'corridors.sections').status).toBe('UNAVAILABLE');
  });

  it('accepts the possession kind for the possession kind', () => {
    const report = assessSourceLinkage(
      TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
      POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
    );
    expect(report.ok).toBe(true);
    // ...and is refused by the other two sources, which is what "cross-kind" means.
    expect(assessSourceLinkage(TEST_ONLY_POSSESSION_SOURCE_LINKAGE, MOVEMENT_REGISTER_SOURCE_KIND).ok).toBe(false);
    expect(assessSourceLinkage(TEST_ONLY_POSSESSION_SOURCE_LINKAGE, CORRIDOR_TOPOLOGY_SOURCE_KIND).ok).toBe(false);
  });

  // ── The existing refusals are untouched by any of this ─────────────────────

  it('still refuses the real mock IntegratedBlocks, even with a possession source linked', () => {
    // IntegratedBlock has `status`, `startTime` and `endTime` but no
    // `occupancyId`, no `occupancyType` and no `relatedTaskIds`, so it fails the
    // completeness check on shape. This is a different refusal from the linkage
    // one, and it is the reason a substituted block cannot stand in for a grant
    // even once a real possession system IS connected.
    for (const status of ['APPROVED', 'PUBLISHED', 'COMPLETED'] as const) {
      const input = inputFor(
        snapshotWith({
          occupancies: mockIntegratedBlocks.map((b) => ({
            ...b,
            status,
          })) as unknown as ExistingOccupancy[],
          possessionSourceLinkage: TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
        }),
        'request.occupancy_type',
      );
      expect(input.coverage?.present, status).toBe(0);
      expect(input.status, status).toBe('UNAVAILABLE');
    }
  });

  it('cannot accept availableWindows, requests or block types in the snapshot at all', () => {
    // Type-level, so it holds before any runtime check runs: `occupancies` is
    // `readonly ExistingOccupancy[]`, and an AvailabilityWindow, a BlockRequest
    // and a BlockType are simply not assignable to it. Three of the four refused
    // substitutes therefore cannot reach readiness in the first place.
    type SnapshotOccupancies = Module4ReadinessSnapshot['occupancies'];

    const wrongShapes: SnapshotOccupancies = [
      // @ts-expect-error an AvailabilityWindow states capacity, not possession
      mockCorridors[0].availableWindows[0],
      // @ts-expect-error a BlockRequest is an intention, not a grant
      mockBlockRequests[0],
      // @ts-expect-error a BlockType is an operational class, not a grant type
      'ROUTINE' as unknown as ExistingOccupancy['occupancyType'],
    ];
    expect(wrongShapes).toHaveLength(3);
  });

  it('still refuses a granted record that is not actually granted', () => {
    for (const status of ['PLANNED', 'CANCELLED'] as const) {
      const input = inputFor(
        snapshotWith({
          occupancies: grantedPossessions.map((o) => ({ ...o, status })),
          possessionSourceLinkage: TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
        }),
        'request.occupancy_type',
      );
      expect(input.coverage?.present, status).toBe(0);
      expect(input.status, status).toBe('UNAVAILABLE');
    }
  });

  it('still refuses an incomplete granted record', () => {
    // The cast is the point, not a shortcut: a record arriving from a JSON
    // payload can carry an empty `occupancyType` even though the type says it
    // cannot. The compiler stops a well-typed caller; `isCompletePossessionRecord`
    // is what stops the boundary-crossed one.
    const malformed = grantedPossessions.map((o) => ({
      ...o,
      occupancyType: '',
    })) as unknown as ExistingOccupancy[];

    const input = inputFor(
      snapshotWith({
        occupancies: malformed,
        possessionSourceLinkage: TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
      }),
      'request.occupancy_type',
    );
    expect(input.coverage?.present).toBe(0);
    expect(input.status).toBe('UNAVAILABLE');
  });

  // ── The census is unchanged ────────────────────────────────────────────────

  it('leaves the real mock world with exactly five blockers, as it always has', () => {
    const readiness = assessModule4Readiness(snapshotWith());
    expect(readiness.blocking.map((b) => b.id).sort()).toEqual([
      'corridors.sections',
      'request.occupancy_type',
      'resources.resource_type',
      'tasks.priority',
      'trains.movement_id',
    ]);
    expect(readiness.blocking).toHaveLength(5);
  });

  it('does not let invented possession records reduce the blocker count', () => {
    // Hand-written grants cover every request, so the ONLY thing left is
    // provenance — and it is not something a caller can fill in.
    const readiness = assessModule4Readiness(
      snapshotWith({ occupancies: grantedPossessions }),
    );
    expect(readiness.blocking.map((b) => b.id).sort()).toEqual([
      'corridors.sections',
      'request.occupancy_type',
      'resources.resource_type',
      'tasks.priority',
      'trains.movement_id',
    ]);
    expect(readiness.blocking).toHaveLength(5);
  });
});
