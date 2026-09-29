/**
 * Phase 9B-8, Decision B — THE POSSESSION/GRANT SYSTEM IS AUTHORITATIVE.
 *
 * The decision being defended: a REQUESTED occupancy is not a GRANTED one, and
 * only the possession system may state Module 3 `occupancy_type`.
 *
 * Four substitutes each look plausible and each would put the optimiser over
 * track that is already blocked, so each gets its own test that it is refused by
 * name:
 *   - `IntegratedBlock`          a planning artefact, even at status APPROVED
 *   - `Corridor.availableWindows` a capacity statement
 *   - `BlockType`                an operational class, not a grant type
 *   - an empty possession set    indistinguishable from "nothing was granted"
 *
 * The tests also pin the absence of a silent `TRAFFIC_BLOCK` default, which is
 * what Module 3 would apply to the gap if this module said nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  assessPossessionSource,
  asGrantedOccupancy,
  asRequestedOccupancy,
  isCompletePossessionRecord,
  isGrantedPossessionStatus,
  POSSESSION_AUTHORITY,
  resolveAuthoritativeRequestOccupancy,
} from '@/services/occupancyAuthority';
import {
  mockBlockRequests,
  mockCorridors,
  mockIntegratedBlocks,
  mockMaintenanceTasks,
} from '@/mocks';
import type { ExistingOccupancy } from '@/types/occupancy';
import type { BlockRequest } from '@/types/block';
import { MODULE4_BLOCK_TYPES } from '@/types/optimizer';

const REQUEST: BlockRequest = mockBlockRequests[0];

/** A granted possession covering `REQUEST`'s task. Test-only. */
function granted(overrides: Partial<ExistingOccupancy> = {}): ExistingOccupancy {
  return {
    occupancyId: 'OCC-TEST-1',
    corridorId: mockCorridors[0].corridorId,
    section: 'SEC-SCD-KCG-01',
    startTime: '2026-01-20T22:00:00Z',
    endTime: '2026-01-20T23:30:00Z',
    status: 'APPROVED',
    occupancyType: 'POSSESSION',
    relatedTaskIds: [REQUEST.taskId],
    ...overrides,
  };
}

describe('a requested block is not a granted possession', () => {
  it('marks a request as REQUESTED and asserts it by the planner', () => {
    const requested = asRequestedOccupancy({ ...REQUEST, occupancyType: 'TRAFFIC_BLOCK' });
    expect(requested.assertion).toBe('REQUESTED');
    expect(requested.assertedBy).toBe('PLANNER_REQUEST');
    expect(requested.requestId).toBe(REQUEST.requestId);
    // The requested value is recorded, and is explicitly not the granted one.
    expect(requested.requestedOccupancyType).toBe('TRAFFIC_BLOCK');
  });

  it('does not let a populated BlockRequest.occupancyType satisfy the gate', () => {
    const withRequestedType: BlockRequest = { ...REQUEST, occupancyType: 'POSSESSION' };
    const resolved = resolveAuthoritativeRequestOccupancy(withRequestedType, []);
    expect(resolved.status).toBe('UNAVAILABLE');
    expect(resolved).toHaveProperty('reason');
    // The reason says outright that the stated value was not used.
    if (resolved.status !== 'UNAVAILABLE') throw new Error('expected UNAVAILABLE');
    expect(resolved.reason).toContain('an intention, not a grant, so it is not used');
    expect(resolved.reason).toContain('TRAFFIC_BLOCK default is not inherited');
  });

  it('leaves all mock requests unresolved, since none has a grant', () => {
    // 18 requests, none of which has ever been granted possession. This is the
    // honest current state and the tests must not quietly change it.
    expect(mockBlockRequests.every((r) => r.occupancyType === undefined)).toBe(true);
    for (const request of mockBlockRequests) {
      expect(resolveAuthoritativeRequestOccupancy(request, []).status).toBe('UNAVAILABLE');
    }
  });

  it('refuses BlockRequest records offered as a possession source', () => {
    const assessment = assessPossessionSource({
      kind: 'REQUESTS',
      requests: mockBlockRequests,
    });
    expect(assessment.accepted).toBe(false);
    if (assessment.accepted) throw new Error('expected a refusal');
    expect(assessment.reason).toBe('REQUEST_IS_NOT_A_GRANT');
  });
});

describe('IntegratedBlock cannot satisfy ExistingOccupancy', () => {
  it('refuses them even at status APPROVED, PUBLISHED and COMPLETED', () => {
    const approved = mockIntegratedBlocks.map((b) => ({ ...b, status: 'APPROVED' as const }));
    const assessment = assessPossessionSource({ kind: 'INTEGRATED_BLOCKS', blocks: approved });
    expect(assessment.accepted).toBe(false);
    if (assessment.accepted) throw new Error('expected a refusal');
    expect(assessment.reason).toBe('INTEGRATED_BLOCK_IS_A_PLANNING_ARTEFACT');
    expect(assessment.detail).toContain('produced by the optimiser');
    expect(assessment.detail).toContain('APPROVED does not change what kind of object it is');
  });

  it('refuses the real mock blocks too, whatever their status', () => {
    expect(mockIntegratedBlocks.length).toBeGreaterThan(0);
    expect(
      assessPossessionSource({ kind: 'INTEGRATED_BLOCKS', blocks: mockIntegratedBlocks }).accepted,
    ).toBe(false);
  });

  it('does not accept them as possession records even via the resolver', () => {
    // The resolver's parameter type is `ExistingOccupancy`, which an
    // `IntegratedBlock` does not satisfy: no occupancyId, no occupancyType, no
    // relatedTaskIds, and a different `status` vocabulary. At runtime it simply
    // matches nothing.
    const asWrongShape = resolveAuthoritativeRequestOccupancy(
      REQUEST,
      mockIntegratedBlocks as unknown as ExistingOccupancy[],
    );
    expect(asWrongShape.status).toBe('UNAVAILABLE');
  });
});

describe('availableWindows cannot satisfy ExistingOccupancy', () => {
  it('refuses a capacity statement as a possession source', () => {
    const assessment = assessPossessionSource({
      kind: 'AVAILABLE_WINDOWS',
      windows: mockCorridors[0].availableWindows,
    });
    expect(assessment.accepted).toBe(false);
    if (assessment.accepted) throw new Error('expected a refusal');
    expect(assessment.reason).toBe('AVAILABLE_WINDOW_IS_A_CAPACITY_STATEMENT');
    expect(assessment.detail).toContain('"Not blocked" is not "possession granted"');
  });

  it('stays blocked even for a corridor with nothing to work on', () => {
    // The most tempting case: a corridor whose every window is AVAILABLE looks
    // like clear evidence that no possession exists. It is not evidence of a
    // grant, so it resolves to nothing.
    const clear = mockCorridors.flatMap((c) =>
      c.availableWindows.map((w) => ({ ...w, status: 'AVAILABLE' as const })),
    );
    expect(clear.length).toBeGreaterThan(0);
    expect(
      assessPossessionSource({ kind: 'AVAILABLE_WINDOWS', windows: clear }).accepted,
    ).toBe(false);
    expect(resolveAuthoritativeRequestOccupancy(REQUEST, []).status).toBe('UNAVAILABLE');
  });
});

describe('BlockType cannot satisfy occupancyType', () => {
  it('refuses the whole Module 4 vocabulary as an occupancy type', () => {
    const assessment = assessPossessionSource({
      kind: 'MODULE_4_BLOCK_TYPES',
      blockTypes: [...MODULE4_BLOCK_TYPES],
    });
    expect(assessment.accepted).toBe(false);
    if (assessment.accepted) throw new Error('expected a refusal');
    expect(assessment.reason).toBe('MODULE_4_BLOCK_TYPE_IS_NOT_A_GRANT_TYPE');
    expect(assessment.detail).toContain('not interconvertible');
  });

  it('names each refused value rather than reporting a bare failure', () => {
    const assessment = assessPossessionSource({
      kind: 'MODULE_4_BLOCK_TYPES',
      blockTypes: ['CORRIDOR', 'EMERGENCY'],
    });
    if (assessment.accepted) throw new Error('expected a refusal');
    for (const value of ['CORRIDOR', 'EMERGENCY']) {
      expect(assessment.detail).toContain(value);
    }
  });

  it('keeps the two vocabularies disjoint: no BlockType is an OptimizerOccupancyType', () => {
    const occupancyTypes = ['POSSESSION', 'SLOW_MOVEMENT', 'TRAFFIC_BLOCK'];
    for (const blockType of MODULE4_BLOCK_TYPES) {
      expect(occupancyTypes).not.toContain(blockType);
    }
  });
});

describe('an empty possession set proves nothing', () => {
  it('is reported as an absent source rather than a satisfied requirement', () => {
    const assessment = assessPossessionSource({ kind: 'POSSESSION_RECORDS', occupancies: [] });
    expect(assessment.accepted).toBe(false);
    if (assessment.accepted) throw new Error('expected a refusal');
    expect(assessment.reason).toBe('EMPTY_POSSESSION_SET_PROVES_NOTHING');
  });

  it('accepts a set of genuine granted records', () => {
    const assessment = assessPossessionSource({
      kind: 'POSSESSION_RECORDS',
      occupancies: [granted()],
    });
    expect(assessment.accepted).toBe(true);
    if (!assessment.accepted) throw new Error('expected acceptance');
    expect(assessment.occupancies).toHaveLength(1);
    expect(assessment.occupancies[0].authority).toBe(POSSESSION_AUTHORITY);
  });

  it('accepts the set but drops anything not granted, rather than filtering silently', () => {
    const assessment = assessPossessionSource({
      kind: 'POSSESSION_RECORDS',
      occupancies: [
        granted(),
        granted({ occupancyId: 'OCC-PLANNED', status: 'PLANNED' }),
        granted({ occupancyId: 'OCC-CANCELLED', status: 'CANCELLED' }),
      ],
    });
    if (!assessment.accepted) throw new Error('expected acceptance');
    expect(assessment.occupancies.map((o) => o.occupancy.occupancyId)).toEqual(['OCC-TEST-1']);
  });
});

describe('only APPROVED or ACTIVE possession counts as granted', () => {
  it('accepts exactly the two statuses that mean possession is in force', () => {
    for (const status of ['APPROVED', 'ACTIVE'] as const) {
      expect(isGrantedPossessionStatus(status)).toBe(true);
    }
    for (const status of ['PLANNED', 'COMPLETED', 'CANCELLED'] as const) {
      expect(isGrantedPossessionStatus(status)).toBe(false);
    }
  });

  it('treats an incomplete granted record as no record at all', () => {
    // A half-populated possession would place a block on the network with an
    // unknown extent, so it counts for nothing.
    const incomplete = granted({ corridorId: '' });
    expect(isCompletePossessionRecord(incomplete)).toBe(false);
    const resolved = resolveAuthoritativeRequestOccupancy(REQUEST, [incomplete]);
    expect(resolved.status).toBe('UNAVAILABLE');
  });

  it('wraps a verified record as the granted assertion it is', () => {
    expect(asGrantedOccupancy(granted())).toEqual({
      assertion: 'GRANTED',
      occupancy: granted(),
      authority: POSSESSION_AUTHORITY,
    });
  });
});

describe('resolving the authoritative occupancy', () => {
  it('returns the granted type when the possession system has granted one', () => {
    const resolved = resolveAuthoritativeRequestOccupancy(REQUEST, [granted()]);
    expect(resolved).toEqual({
      status: 'AUTHORITATIVE',
      occupancyType: 'POSSESSION',
      occupancyId: 'OCC-TEST-1',
      authority: POSSESSION_AUTHORITY,
    });
  });

  it('fails explicitly on two granted possessions of DIFFERENT types', () => {
    // A real contradiction, not a tie to break: choosing one would be a
    // scheduling decision made by a data reader.
    const resolved = resolveAuthoritativeRequestOccupancy(REQUEST, [
      granted({ occupancyId: 'OCC-A', occupancyType: 'POSSESSION' }),
      granted({ occupancyId: 'OCC-B', occupancyType: 'TRAFFIC_BLOCK' }),
    ]);
    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status !== 'UNAVAILABLE') throw new Error('expected UNAVAILABLE');
    expect(resolved.reason).toContain('conflicting occupancy types');
    expect(resolved.reason).toContain('fails explicitly');
  });

  it('picks the lowest occupancyId when granted types agree, deterministically', () => {
    const resolved = resolveAuthoritativeRequestOccupancy(REQUEST, [
      granted({ occupancyId: 'OCC-Z' }),
      granted({ occupancyId: 'OCC-A' }),
    ]);
    expect(resolved.status).toBe('AUTHORITATIVE');
    if (resolved.status !== 'AUTHORITATIVE') throw new Error('expected AUTHORITATIVE');
    expect(resolved.occupancyId).toBe('OCC-A');
  });

  it('never invents a default when nothing was granted', () => {
    const resolved = resolveAuthoritativeRequestOccupancy(REQUEST, []);
    expect(resolved.status).toBe('UNAVAILABLE');
    // The literal Module 3 default is never produced as a substitute.
    expect(JSON.stringify(resolved)).not.toContain('"occupancyType"');
  });
});

describe('purity', () => {
  it('does not mutate the records it was given', () => {
    const occupancies = [granted(), granted({ occupancyId: 'OCC-B', status: 'PLANNED' })];
    const before = JSON.stringify(occupancies);
    const request = { ...REQUEST };
    const requestBefore = JSON.stringify(request);

    resolveAuthoritativeRequestOccupancy(request, occupancies);
    assessPossessionSource({ kind: 'POSSESSION_RECORDS', occupancies });
    asRequestedOccupancy(request);
    asGrantedOccupancy(occupancies[0]);

    expect(JSON.stringify(occupancies)).toBe(before);
    expect(JSON.stringify(request)).toBe(requestBefore);
  });

  it('returns identical results across repeated calls', () => {
    const occupancies = [granted(), granted({ occupancyId: 'OCC-B', occupancyType: 'SLOW_MOVEMENT' })];
    const first = resolveAuthoritativeRequestOccupancy(REQUEST, occupancies);
    const second = resolveAuthoritativeRequestOccupancy(REQUEST, occupancies);
    expect(first).toEqual(second);
  });

  it('keeps the request and the possession sets structurally separate', () => {
    // Same task universe, two different questions. The resolver joins on taskId
    // because ExistingOccupancy has no requestId, and inventing one would add a
    // field Module 3 does not have.
    expect(REQUEST.taskId).toBeTruthy();
    expect(mockMaintenanceTasks.some((t) => t.taskId === REQUEST.taskId)).toBe(true);
  });
});
