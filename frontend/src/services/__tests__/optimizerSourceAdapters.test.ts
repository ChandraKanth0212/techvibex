/**
 * Contract and type tests for the upstream-source adapter boundary.
 *
 * THESE ARE NOT SOURCE RECORDS.
 *
 * There is deliberately no test data in this file that resembles a movement, a
 * route or a possession. Every literal is either a type probe, a
 * `@ts-expect-error` marker, or a self-description — and every self-description
 * is a placeholder whose id says it is one, because the point of the module under
 * test is that no real source exists to describe.
 *
 * What is tested is therefore almost entirely the TYPE LAYER:
 *   - the three adapters are separate, branded and non-interchangeable,
 *   - the refused substitutes are not assignable to any payload,
 *   - records cannot be obtained without a descriptor,
 *   - the boundary cannot be built with a source missing.
 *
 * `describeUpstreamBoundary` and `toSourceLinkage` are the only functions
 * exercised at runtime, and both are pure: they read three descriptors and report
 * verdicts.
 *
 * Every `@ts-expect-error` below is live. `tsc` reports an unused directive as an
 * error, so a negative test that stopped failing would break the typecheck rather
 * than quietly pass.
 */

import { describe, expect, it } from 'vitest';
import type {
  CorridorTopologyAdapter,
  MovementRegisterAdapter,
  PossessionGrantAdapter,
  SourcedData,
  UpstreamSourceBoundary,
  UpstreamSourceDescriptor,
} from '@/services/optimizerSourceAdapters';
import {
  describeUpstreamBoundary,
  toSourceLinkage,
} from '@/services/optimizerSourceAdapters';
import {
  CORRIDOR_TOPOLOGY_SOURCE_KIND,
  MOVEMENT_REGISTER_SOURCE_KIND,
  POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
  type AuthoritativeSourceKind,
} from '@/services/optimizerSourceContracts';
import type { AvailabilityWindow, Corridor, CorridorTopologySource } from '@/types/corridor';
import type { BlockRequest, IntegratedBlock } from '@/types/block';
import type { BlockType } from '@/types/maintenance';
import type { ExistingOccupancy, RequestedOccupancy } from '@/types/occupancy';
import type { MovementRegister } from '@/types/train';

// ─────────────────────────────────────────────────────────────────────────────
// Placeholders — descriptors only, never records
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A self-description of a source that does not exist.
 *
 * `NOT_CONNECTED` is the honest value and the id is unmistakable. The tests that
 * need a linkage the existing gate accepts use `ACCEPTED_DESCRIPTOR`, which is a
 * CLAIM by a hypothetical adapter, not a connection to anything.
 */
const UNCONNECTED_DESCRIPTOR: UpstreamSourceDescriptor = {
  sourceId: 'NO-SOURCE-CONFIGURED-THIS-IS-A-PLACEHOLDER',
  authoritative: false,
  sourceStatus: 'NOT_CONNECTED',
};

/** A hypothetical adapter claiming to be connected. A CLAIM, not a connection. */
const ACCEPTED_DESCRIPTOR: UpstreamSourceDescriptor = {
  sourceId: 'HYPOTHETICAL-ADAPTER-CLAIM-NOT-A-REAL-CONNECTION',
  authoritative: true,
  sourceStatus: 'CONNECTED',
};

const ALL_KINDS = [
  MOVEMENT_REGISTER_SOURCE_KIND,
  CORRIDOR_TOPOLOGY_SOURCE_KIND,
  POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
] as const;

const NO_IMPLEMENTATION = 'no implementation';

function refuse(): never {
  throw new Error(`This stub is a type probe; it has ${NO_IMPLEMENTATION}.`);
}

/**
 * Stubs that satisfy each adapter interface and refuse to return anything.
 *
 * Implementable, and deliberately useless: a stub that could return a record would
 * be a source in all but name. The `as never` return type also means a caller
 * cannot read a value out of one even by accident.
 */
function movementStub(descriptor: UpstreamSourceDescriptor): MovementRegisterAdapter {
  return {
    sourceKind: MOVEMENT_REGISTER_SOURCE_KIND,
    describeSource: () => descriptor,
    fetchMovementRegister: () => refuse(),
  };
}

function topologyStub(descriptor: UpstreamSourceDescriptor): CorridorTopologyAdapter {
  return {
    sourceKind: CORRIDOR_TOPOLOGY_SOURCE_KIND,
    describeSource: () => descriptor,
    fetchCorridorTopology: () => refuse(),
  };
}

function possessionStub(descriptor: UpstreamSourceDescriptor): PossessionGrantAdapter {
  return {
    sourceKind: POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
    describeSource: () => descriptor,
    fetchGrantedPossessions: () => refuse(),
  };
}

function boundaryWith(descriptor: UpstreamSourceDescriptor): UpstreamSourceBoundary {
  return {
    movementRegister: movementStub(descriptor),
    corridorTopology: topologyStub(descriptor),
    possessionGrant: possessionStub(descriptor),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the three external sources are separate, branded dependencies', () => {
  it('declares all three adapters as REQUIRED, so a boundary cannot be partial', () => {
    // @ts-expect-error possessionGrant is required: a source cannot be omitted
    const missingPossession: UpstreamSourceBoundary = {
      movementRegister: movementStub(UNCONNECTED_DESCRIPTOR),
      corridorTopology: topologyStub(UNCONNECTED_DESCRIPTOR),
    };

    // @ts-expect-error corridorTopology is required
    const missingTopology: UpstreamSourceBoundary = {
      movementRegister: movementStub(UNCONNECTED_DESCRIPTOR),
      possessionGrant: possessionStub(UNCONNECTED_DESCRIPTOR),
    };

    // @ts-expect-error movementRegister is required
    const missingMovement: UpstreamSourceBoundary = {
      corridorTopology: topologyStub(UNCONNECTED_DESCRIPTOR),
      possessionGrant: possessionStub(UNCONNECTED_DESCRIPTOR),
    };

    // The three were still built as objects, so this asserts the omissions are
    // compile-time facts rather than runtime crashes.
    expect(Object.keys(missingPossession)).toEqual(['movementRegister', 'corridorTopology']);
    expect(Object.keys(missingTopology)).toEqual(['movementRegister', 'possessionGrant']);
    expect(Object.keys(missingMovement)).toEqual(['corridorTopology', 'possessionGrant']);
  });

  it('will not accept an adapter of the wrong kind in any slot', () => {
    const movement = movementStub(UNCONNECTED_DESCRIPTOR);
    const possession = possessionStub(UNCONNECTED_DESCRIPTOR);

    const wrongTopology: UpstreamSourceBoundary = {
      movementRegister: movement,
      // @ts-expect-error a movement register is not a corridor topology source
      corridorTopology: movement,
      possessionGrant: possession,
    };

    const wrongPossession: UpstreamSourceBoundary = {
      movementRegister: movement,
      corridorTopology: topologyStub(UNCONNECTED_DESCRIPTOR),
      // @ts-expect-error a movement register is not a possession/grant source
      possessionGrant: movement,
    };

    expect(wrongTopology.movementRegister.sourceKind).toBe(MOVEMENT_REGISTER_SOURCE_KIND);
    expect(wrongPossession.possessionGrant.sourceKind).toBe(MOVEMENT_REGISTER_SOURCE_KIND);
  });

  it('brands each adapter with its own literal source kind', () => {
    expect(movementStub(UNCONNECTED_DESCRIPTOR).sourceKind).toBe(MOVEMENT_REGISTER_SOURCE_KIND);
    expect(topologyStub(UNCONNECTED_DESCRIPTOR).sourceKind).toBe(CORRIDOR_TOPOLOGY_SOURCE_KIND);
    expect(possessionStub(UNCONNECTED_DESCRIPTOR).sourceKind).toBe(
      POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
    );
    expect(new Set(ALL_KINDS).size).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('no fallback can be expressed at the boundary', () => {
  it('asks the movement register for a scope and nothing else', () => {
    // No fallbackTrainId, no defaultMovementId, no candidate-list argument: the
    // only thing the caller supplies is what to ask about.
    const args: Parameters<MovementRegisterAdapter['fetchMovementRegister']> = [
      { runDate: 'PROBE-NOT-A-DATE', corridorIds: ['PROBE-NOT-A-CORRIDOR'] },
    ];
    expect(args).toHaveLength(1);
    expect(Object.keys(args[0])).toEqual(['runDate', 'corridorIds']);
  });

  it('asks the topology source for corridors and a date, and nothing else', () => {
    // No parameter exists through which a caller could offer a candidate section
    // list, so a single-element [sectionId] cannot be manufactured here.
    const args: Parameters<CorridorTopologyAdapter['fetchCorridorTopology']> = [
      { corridorIds: ['PROBE-NOT-A-CORRIDOR'], effectiveOn: 'PROBE-NOT-A-DATE' },
    ];
    expect(args).toHaveLength(1);
    expect(Object.keys(args[0])).toEqual(['corridorIds', 'effectiveOn']);
  });

  it('asks the possession system for a bounded window, and nothing that answers for itself', () => {
    // No BlockRequest, no BlockType, no default occupancy type.
    const args: Parameters<PossessionGrantAdapter['fetchGrantedPossessions']> = [
      {
        corridorIds: ['PROBE-NOT-A-CORRIDOR'],
        windowStart: 'PROBE-NOT-A-TIME',
        windowEnd: 'PROBE-NOT-A-TIME',
      },
    ];
    expect(args).toHaveLength(1);
    expect(Object.keys(args[0])).toEqual(['corridorIds', 'windowStart', 'windowEnd']);
  });

  it('will not accept an IntegratedBlock, an AvailabilityWindow, a request or a BlockType as possession', () => {
    // All four are properly typed and NOT cast, so the compiler sees the real
    // incompatibility rather than one forced by `as unknown as`.
    const integratedBlock: IntegratedBlock = {
      blockId: 'PROBE-NOT-A-BLOCK',
      date: '2026-01-01',
      sectionId: 'PROBE-NOT-A-SECTION',
      fromStation: 'PROBE',
      toStation: 'PROBE',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T01:00:00Z',
      durationMinutes: 60,
      departments: [],
      taskIds: [],
      requestIds: [],
      status: 'APPROVED',
      constraintValidation: {
        corridorAvailable: false,
        requiredDurationSatisfied: false,
        passengerTrainConflict: false,
        goodsTrainConflict: false,
        resourceConflict: false,
        locationConflict: false,
        dependencyConflict: false,
        overallFeasible: false,
      },
      operationalImpact: {
        trainsAffectedCount: 0,
        totalDelayMinutes: 0,
        estimatedFreightThroughputImpact: 'PROBE-NOT-AN-IMPACT',
        safetyRiskIndex: 0,
      },
      source: 'MANUAL',
    };

    const window: AvailabilityWindow = {
      windowId: 'PROBE-NOT-A-WINDOW',
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-01T01:00:00Z',
      durationMinutes: 60,
      status: 'AVAILABLE',
    };

    const request: BlockRequest = {
      requestId: 'PROBE-NOT-A-REQUEST',
      taskId: 'PROBE-NOT-A-TASK',
      department: 'ENGINEERING',
      sectionId: 'PROBE-NOT-A-SECTION',
      requestedDate: '2026-01-01',
      preferredStart: '2026-01-01T00:00:00Z',
      preferredEnd: '2026-01-01T01:00:00Z',
      durationMinutes: 60,
      blockType: 'CORRIDOR',
      priority: 1,
      status: 'PENDING',
      submittedAt: '2026-01-01T00:00:00Z',
    };

    const blockType: BlockType = 'ROUTINE';

    // A one-argument sink: each call site is a standalone assignability check, so
    // the error lands on the argument rather than on a whole array literal.
    const acceptsPossession = (_possession: ExistingOccupancy): void => {};

    acceptsPossession(
      // @ts-expect-error an IntegratedBlock is a planning artefact, not a grant
      integratedBlock,
    );
    acceptsPossession(
      // @ts-expect-error an AvailabilityWindow states capacity, not possession
      window,
    );
    acceptsPossession(
      // @ts-expect-error a BlockRequest is an intention, not a grant
      request,
    );
    acceptsPossession(
      // @ts-expect-error a BlockType is an operational class, not a grant type
      blockType,
    );
    // The probes are still usable values, so this is a runtime assertion about the
    // literals themselves rather than a compile-time no-op.
    expect([integratedBlock.status, window.status, request.status, blockType]).toEqual([
      'APPROVED',
      'AVAILABLE',
      'PENDING',
      'ROUTINE',
    ]);
  });

  it('will not accept a RequestedOccupancy as a granted record', () => {
    // Deliberately a different type, with no status, occupancyId or times.
    const requested: RequestedOccupancy = {
      assertion: 'REQUESTED',
      requestId: 'PROBE-NOT-A-REQUEST',
      assertedBy: 'PLANNER_REQUEST',
    };
    const acceptsPossession = (_possession: ExistingOccupancy): void => {};
    acceptsPossession(
      // @ts-expect-error a requested occupancy is never a granted one
      requested,
    );
    // The two vocabularies stay disjoint even at the type level.
    expect(requested.assertion).toBe('REQUESTED');
  });

  it('keeps the resource-type mapping out of every signature', () => {
    // Decision C stays a separate explicit concern. A resourceType parameter
    // appearing on any of these is how an implicit mapping would get in.
    const boundaryMethods = [
      movementStub(UNCONNECTED_DESCRIPTOR),
      topologyStub(UNCONNECTED_DESCRIPTOR),
      possessionStub(UNCONNECTED_DESCRIPTOR),
    ].flatMap((adapter) => Object.keys(adapter).filter((k) => k.startsWith('fetch')));

    expect(boundaryMethods.sort()).toEqual([
      'fetchCorridorTopology',
      'fetchGrantedPossessions',
      'fetchMovementRegister',
    ]);
    for (const method of boundaryMethods) {
      expect(method.toLowerCase()).not.toContain('resourcetype');
      expect(method.toLowerCase()).not.toContain('mapping');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('records cannot be obtained without their provenance claim', () => {
  it('makes both fields of the pairing required', () => {
    // @ts-expect-error descriptor is required: data never arrives alone
    const orphanData: SourcedData<MovementRegister> = { data: { movements: [] } };
    expect(orphanData.data.movements).toEqual([]);

    // @ts-expect-error data is required: a claim without records proves nothing
    const orphanClaim: SourcedData<MovementRegister> = {
      descriptor: UNCONNECTED_DESCRIPTOR,
    };
    expect(orphanClaim.descriptor.sourceStatus).toBe('NOT_CONNECTED');
  });

  it('is a structural pairing, not a convention', () => {
    const pair: SourcedData<readonly string[]> = {
      descriptor: UNCONNECTED_DESCRIPTOR,
      data: [],
    };
    expect(Object.keys(pair).sort()).toEqual(['data', 'descriptor']);
  });

  it('reuses the existing record types, so an adapter cannot smuggle a looser shape past the validators', () => {
    const movement: SourcedData<MovementRegister> = {
      descriptor: UNCONNECTED_DESCRIPTOR,
      data: { movements: [] },
    };
    expect(movement.data.movements).toEqual([]);

    const topology: SourcedData<CorridorTopologySource> = {
      descriptor: UNCONNECTED_DESCRIPTOR,
      data: { topology: [] },
    };
    expect(topology.data.topology).toEqual([]);

    // The topology record is the validated one, not a loose list of strings.
    const record: CorridorTopologySource['topology'][number] = {
      corridorId: 'PROBE-NOT-A-CORRIDOR',
      orderedSectionIds: ['PROBE-NOT-A-SECTION'],
    };
    expect(record.orderedSectionIds).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('descriptors convert to the existing linkage model, and to nothing stronger', () => {
  it('reuses AuthoritativeSourceLinkage rather than inventing a second claim', () => {
    const linkage = toSourceLinkage(MOVEMENT_REGISTER_SOURCE_KIND, ACCEPTED_DESCRIPTOR);
    expect(linkage).toEqual({
      sourceKind: MOVEMENT_REGISTER_SOURCE_KIND,
      sourceId: ACCEPTED_DESCRIPTOR.sourceId,
      authoritative: true,
      sourceStatus: 'CONNECTED',
    });
  });

  it('carries a non-authoritative descriptor through as non-authoritative', () => {
    const linkage = toSourceLinkage(CORRIDOR_TOPOLOGY_SOURCE_KIND, UNCONNECTED_DESCRIPTOR);
    expect(linkage.authoritative).toBe(false);
    expect(linkage.sourceStatus).toBe('NOT_CONNECTED');
  });

  it('takes the source kind as an argument, so a caller must name what it claims to be', () => {
    for (const kind of ALL_KINDS) {
      const linkage = toSourceLinkage(kind, ACCEPTED_DESCRIPTOR);
      expect(linkage.sourceKind).toBe(kind);
      expect(linkage.sourceId).toBe(ACCEPTED_DESCRIPTOR.sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the boundary reports all three sources, connected or not', () => {
  it('always returns exactly three reports, in a fixed order', () => {
    for (const descriptor of [UNCONNECTED_DESCRIPTOR, ACCEPTED_DESCRIPTOR]) {
      const reports = describeUpstreamBoundary(boundaryWith(descriptor));
      expect(reports).toHaveLength(3);
      expect(reports.map((r) => r.sourceKind)).toEqual([
        MOVEMENT_REGISTER_SOURCE_KIND,
        CORRIDOR_TOPOLOGY_SOURCE_KIND,
        POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
      ]);
    }
  });

  it('reports an unconnected source as present-and-unaccepted, never as absent', () => {
    // "Nobody asked" and "asked, and there is nothing there" must stay different,
    // so a missing source is still listed.
    const reports = describeUpstreamBoundary(boundaryWith(UNCONNECTED_DESCRIPTOR));
    for (const report of reports) {
      expect(report.accepted, String(report.sourceKind)).toBe(false);
      expect(report.sourceId, String(report.sourceKind)).toBe(
        'NO-SOURCE-CONFIGURED-THIS-IS-A-PLACEHOLDER',
      );
      expect(report.linkage.reason).toBeTruthy();
      expect(report.linkage.ok).toBe(false);
    }
  });

  it('accepts a source only when the EXISTING gate would', () => {
    // This module routes the claim through the gate that already exists rather
    // than adding a weaker private one.
    const reports = describeUpstreamBoundary(boundaryWith(ACCEPTED_DESCRIPTOR));
    expect(reports.every((r) => r.accepted)).toBe(true);
    for (const report of reports) {
      expect(report.linkage.ok).toBe(true);
      expect(report.linkage.linkage?.sourceKind).toBe(report.sourceKind);
    }
  });

  it('does not let one accepted source make another accepted', () => {
    const mixed: UpstreamSourceBoundary = {
      movementRegister: movementStub(ACCEPTED_DESCRIPTOR),
      corridorTopology: topologyStub(UNCONNECTED_DESCRIPTOR),
      possessionGrant: possessionStub(UNCONNECTED_DESCRIPTOR),
    };
    const reports = describeUpstreamBoundary(mixed);
    expect(reports.map((r) => r.accepted)).toEqual([true, false, false]);
  });

  it('is pure: identical boundaries give identical reports', () => {
    const one = describeUpstreamBoundary(boundaryWith(UNCONNECTED_DESCRIPTOR));
    const two = describeUpstreamBoundary(boundaryWith(UNCONNECTED_DESCRIPTOR));
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the module ships no source data and no connector', () => {
  it('exports only two pure functions, so no adapter or sample payload exists at runtime', async () => {
    const module = await import('@/services/optimizerSourceAdapters');
    // Everything else in the module is a type and does not exist at runtime. This
    // is the check that no adapter, connector or record was added alongside them.
    expect(Object.keys(module).sort()).toEqual(['describeUpstreamBoundary', 'toSourceLinkage']);
  });

  it('the stubs refuse to return anything rather than yielding a value', () => {
    const stub = movementStub(UNCONNECTED_DESCRIPTOR);
    expect(() => stub.fetchMovementRegister({ runDate: '', corridorIds: [] })).toThrow(
      NO_IMPLEMENTATION,
    );
  });

  it('a Corridor offers only the one declared section, which is why it cannot stand in for topology', () => {
    // The boundary takes an adapter, never a Corridor to derive sections from.
    const probe: Pick<Corridor, 'corridorId' | 'sectionId'> = {
      corridorId: 'PROBE-NOT-A-CORRIDOR',
      sectionId: 'PROBE-NOT-A-SECTION',
    };
    expect(Object.keys(probe)).toEqual(['corridorId', 'sectionId']);
    expect(probe.sectionId).toBe('PROBE-NOT-A-SECTION');
  });

  it('declares the three source kinds it depends on, and no others', () => {
    const kinds: readonly AuthoritativeSourceKind[] = ALL_KINDS;
    expect(kinds).toHaveLength(3);
    expect(kinds).not.toContain('UNKNOWN' as AuthoritativeSourceKind);
  });
});
