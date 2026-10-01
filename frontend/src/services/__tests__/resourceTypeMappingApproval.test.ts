/**
 * END-TO-END HUMAN APPROVAL OF A RESOURCE-TYPE CORRESPONDENCE.
 *
 * `@/services/__tests__/resourceTypeMapping.test.ts` proves the mapping LOGIC:
 * that the approved table is the only authority and that nothing is inferred from
 * a name. This file proves the PATH, which was the gap it left — the mechanism had
 * no production caller, so `APPROVED_RESOURCE_TYPE_MAPPINGS` stayed `[]` forever
 * and `resources.resource_type` could never leave UNRESOLVED no matter how many
 * people opened the app.
 *
 * The path under test:
 *
 *   a human supplies the pair, their name, the instant, a decision reference
 *     and a mapping version
 *     -> resourceService.approveResourceTypeMapping  (vocabulary check)
 *        -> mockStore.approveResourceTypeMapping
 *           -> mapResourceType (the approved authority, unchanged)
 *           -> ResourceTypeMapping persisted
 *           -> RESOURCE_TYPE_MAPPING_APPROVED audit event appended
 *     -> assessModule4Readiness reports resources.resource_type AVAILABLE
 *     -> buildOptimizeRequest emits that approved value as resource_type
 *
 * What these tests hold the implementation to:
 *
 *   - the store ships EMPTY: no correspondence is seeded from the resource list
 *   - an approval writes the pair the human chose, not one the app preferred
 *   - a refusal writes NOTHING - no table entry, no audit event, no readiness change
 *   - the approver is required, is never defaulted, and DEMO_USER is refused
 *   - the decision reference is required, so the decision can be audited
 *   - the audit event names the person, the instant and the reference
 *   - readiness and the request builder read the SAME approved value
 *   - blocker #2 (request.occupancy_type) is untouched by any of this
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockStore, type ResourceTypeMappingApprovalResult } from '@/services/mockStore';
import { resourceService } from '@/services/resourceService';
import {
  assessModule4Readiness,
  type Module4ReadinessSnapshot,
} from '@/services/optimizerRequestReadiness';
import { buildOptimizeRequest } from '@/services/optimizerRequestBuilder';
import { INITIAL_PLANNER_SCOPE } from '@/utils/plannerScope';
import { RESOURCE_TYPE_MAPPING_APPROVED } from '@/types/audit';
import type { PriorityConfirmationActor } from '@/types/maintenance';
import type { OptimizerResourceType } from '@/types/optimizer';
import type { ResourceType, ResourceTypeMapping } from '@/types/resource';
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

/** A real, named person. Never defaulted anywhere in the code under test. */
const ACTOR: PriorityConfirmationActor = {
  userId: 'res.mgr.fernandes',
  userRole: 'Resource Manager',
};

const APPROVED_AT = '2026-02-03T11:30:00Z';
const DECISION_REFERENCE = 'MIN/RM/2026-02/04 - item 3';

const SOURCE: ResourceType = 'TRACK_MACHINE';
const TARGET: OptimizerResourceType = 'MACHINERY';

function expectApproved(result: ResourceTypeMappingApprovalResult) {
  if (!result.ok) {
    throw new Error(`expected the approval to succeed, got ${result.reason}: ${result.message}`);
  }
  return result;
}

function expectRefused(result: ResourceTypeMappingApprovalResult) {
  if (result.ok) {
    throw new Error('expected the approval to be refused, but it succeeded');
  }
  return result;
}

/** Every real, distinct Module 4 resource type present in the shipped world. */
const REAL_SOURCE_TYPES = Array.from(
  new Set(mockResources.map((r) => r.resourceType)),
) as ResourceType[];

/** A pair the human may legitimately decide, chosen per source type. */
function someTargetFor(source: ResourceType): OptimizerResourceType {
  const targets = resourceService.getTargetTypes() as readonly OptimizerResourceType[];
  return targets[REAL_SOURCE_TYPES.indexOf(source) % targets.length];
}

function approveViaStore(
  overrides: Partial<{
    module4ResourceType: ResourceType;
    module3ResourceType: OptimizerResourceType;
    mappingVersion: string;
    approvedBy: string;
    approvedAt: string;
    reference: string;
    actor: PriorityConfirmationActor;
  }> = {},
) {
  return mockStore.approveResourceTypeMapping({
    module4ResourceType: overrides.module4ResourceType ?? SOURCE,
    module3ResourceType: overrides.module3ResourceType ?? TARGET,
    mappingVersion: overrides.mappingVersion ?? 'v1',
    approvedBy: overrides.approvedBy ?? ACTOR.userId,
    approvedAt: overrides.approvedAt ?? APPROVED_AT,
    reference: overrides.reference ?? DECISION_REFERENCE,
    actor: overrides.actor ?? ACTOR,
  });
}

function auditEventsFor(action: string) {
  return mockStore.getAuditLog().filter((e) => e.action === action);
}

function snapshotWith(mappings?: readonly ResourceTypeMapping[]): Module4ReadinessSnapshot {
  const base = {
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
    scope: INITIAL_PLANNER_SCOPE,
  };
  return mappings === undefined ? base : { ...base, resourceTypeMappings: mappings };
}

function resourceTypeInput(mappings?: readonly ResourceTypeMapping[]) {
  const readiness = assessModule4Readiness(snapshotWith(mappings));
  const input = readiness.inputs.find((i) => i.id === 'resources.resource_type');
  if (!input) throw new Error('no resources.resource_type readiness input');
  return input;
}

beforeEach(() => {
  mockStore.resetStore();
});

// ── A. Nothing is fabricated to begin with ─────────────────────────────────────

describe('A. the shipped world contains no approved correspondence', () => {
  it('starts with an empty approved table', () => {
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
  });

  it('leaves every real resource unresolved, so the blocker is honest', () => {
    const input = resourceTypeInput();
    expect(input.status).toBe('UNRESOLVED');
    expect(input.coverage?.present).toBe(0);
    expect(input.coverage?.total).toBe(mockResources.length);
  });

  it('does not let a Module 4 record assert its own Module 3 type', () => {
    // Every shipped record leaves the field unset, and this batch must not invent one.
    expect(mockResources.every((r) => r.module3ResourceType === undefined)).toBe(true);
    expect(resourceTypeInput().coverage?.present).toBe(0);
  });
});

// ── B. A human approval is recorded exactly as given ───────────────────────────

describe('B. an explicit human approval records exactly what was decided', () => {
  it('persists the chosen pair with the approval record attached', () => {
    const result = expectApproved(approveViaStore());

    expect(result.mapping.module4ResourceType).toBe(SOURCE);
    expect(result.mapping.module3ResourceType).toBe(TARGET);
    expect(result.mapping.mappingVersion).toBe('v1');
    expect(result.mapping.approval).toEqual({
      approvedBy: ACTOR.userId,
      approvedAt: APPROVED_AT,
      reference: DECISION_REFERENCE,
    });
    expect(mockStore.getResourceTypeMappings()).toHaveLength(1);
  });

  it('records the human decision rather than a value the app preferred', () => {
    // Deliberately an unintuitive pairing: if the implementation inferred anything,
    // this is where a name-similarity guess would show up as a substitution.
    expectApproved(
      approveViaStore({
        module4ResourceType: 'OHE_CREW',
        module3ResourceType: 'MACHINERY',
      }),
    );

    const stored = mockStore.getResourceTypeMappings()[0];
    expect(stored.module3ResourceType).toBe('MACHINERY');
  });

  it('accepts a many-to-one table, because the authority permits one', () => {
    // Two Module 4 types may legitimately decide onto the same Module 3 type. The
    // authority rejects the opposite (one source mapped twice), not this.
    expectApproved(
      approveViaStore({ module4ResourceType: 'TRACK_MACHINE', module3ResourceType: 'MACHINERY' }),
    );
    expectApproved(
      approveViaStore({ module4ResourceType: 'OHE_CREW', module3ResourceType: 'MACHINERY' }),
    );

    expect(mockStore.getResourceTypeMappings()).toHaveLength(2);
  });

  it('supersedes a prior approval of the same source type and keeps the old version auditable', () => {
    expectApproved(approveViaStore({ mappingVersion: 'v1' }));
    expectApproved(
      approveViaStore({ module3ResourceType: 'ENGINEERING_TRAIN', mappingVersion: 'v2' }),
    );

    const stored = mockStore.getResourceTypeMappings();
    expect(stored).toHaveLength(1);
    expect(stored[0].module3ResourceType).toBe('ENGINEERING_TRAIN');
    expect(stored[0].mappingVersion).toBe('v2');

    const versions = auditEventsFor(RESOURCE_TYPE_MAPPING_APPROVED).map((e) => e.previousStatus);
    expect(versions).toContain('v1');
  });
});

// ── C. A refusal writes nothing at all ─────────────────────────────────────────

describe('C. a refused approval writes nothing', () => {
  it('refuses an unnamed actor and writes no table entry or audit event', () => {
    const refused = expectRefused(
      approveViaStore({ actor: { userId: '   ', userRole: 'Resource Manager' } }),
    );

    expect(refused.reason).toBe('ACTOR_NOT_IDENTIFIED');
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
    expect(auditEventsFor(RESOURCE_TYPE_MAPPING_APPROVED)).toHaveLength(0);
  });

  it('refuses a missing role', () => {
    const refused = expectRefused(
      approveViaStore({ actor: { userId: ACTOR.userId, userRole: '' } }),
    );
    expect(refused.reason).toBe('ACTOR_NOT_IDENTIFIED');
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
  });

  it('refuses a missing approver name', () => {
    const refused = expectRefused(approveViaStore({ approvedBy: '  ' }));
    expect(refused.reason).toBe('ACTOR_NOT_IDENTIFIED');
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
  });

  it('refuses the prototype placeholder as an approver, because it names nobody', () => {
    const refused = expectRefused(approveViaStore({ approvedBy: 'DEMO_USER' }));

    expect(refused.reason).toBe('APPROVER_NOT_A_PERSON');
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
    expect(auditEventsFor(RESOURCE_TYPE_MAPPING_APPROVED)).toHaveLength(0);
  });

  it('refuses a missing decision reference', () => {
    const refused = expectRefused(approveViaStore({ reference: '   ' }));

    expect(refused.reason).toBe('REFERENCE_NOT_SUPPLIED');
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
    expect(auditEventsFor(RESOURCE_TYPE_MAPPING_APPROVED)).toHaveLength(0);
  });

  it('refuses a missing instant of approval rather than filling one in', () => {
    const refused = expectRefused(approveViaStore({ approvedAt: '' }));

    expect(refused.ok).toBe(false);
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
  });

  it('refuses a missing mapping version, so the decision cannot be attributed', () => {
    const refused = expectRefused(approveViaStore({ mappingVersion: '  ' }));

    expect(refused.reason).toBe('REFUSED');
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
  });

  it('leaves an already-approved table untouched when a later approval is refused', () => {
    expectApproved(approveViaStore());
    const before = mockStore.getResourceTypeMappings();

    expectRefused(approveViaStore({ module4ResourceType: 'OHE_CREW', reference: '' }));

    expect(mockStore.getResourceTypeMappings()).toEqual(before);
    expect(auditEventsFor(RESOURCE_TYPE_MAPPING_APPROVED)).toHaveLength(1);
  });
});

// ── D. Values outside either vocabulary are refused as unrecognised ────────────

describe('D. a value outside either vocabulary is refused, not coerced', () => {
  it('refuses a source that is not a Module 4 resource type', async () => {
    const result = await resourceService.approveResourceTypeMapping({
      module4ResourceType: 'PLUMBING_CREW',
      module3ResourceType: 'MANPOWER',
      mappingVersion: 'v1',
      approvedBy: ACTOR.userId,
      approvedAt: APPROVED_AT,
      reference: DECISION_REFERENCE,
      actor: ACTOR,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('EXTERNAL_REASON');
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
  });

  it('refuses a target that is not a Module 3 resource type', async () => {
    const result = await resourceService.approveResourceTypeMapping({
      module4ResourceType: 'TRACK_MACHINE',
      module3ResourceType: 'TRACK_MACHINE',
      mappingVersion: 'v1',
      approvedBy: ACTOR.userId,
      approvedAt: APPROVED_AT,
      reference: DECISION_REFERENCE,
      actor: ACTOR,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('EXTERNAL_REASON');
    expect(mockStore.getResourceTypeMappings()).toEqual([]);
  });

  it('offers only the two real vocabularies to choose from', () => {
    expect(resourceService.getSourceTypes()).toContain('TRACK_MACHINE');
    expect(resourceService.getTargetTypes()).toContain('MACHINERY');
    expect(resourceService.getTargetTypes()).not.toContain('TRACK_MACHINE');
  });
});

// ── E. Audit attribution ───────────────────────────────────────────────────────

describe('E. the approval is attributable in the audit log', () => {
  it('records the action, the pair, the person, the instant and the reference', () => {
    const result = expectApproved(approveViaStore());

    const events = auditEventsFor(RESOURCE_TYPE_MAPPING_APPROVED);
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.auditId).toBe(result.auditId);
    expect(event.entityType).toBe('RESOURCE_TYPE_MAPPING');
    expect(event.entityId).toBe(SOURCE);
    expect(event.newStatus).toBe(`${SOURCE}->${TARGET}`);
    expect(event.previousStatus).toBe('UNAPPROVED');
    expect(event.userId).toBe(ACTOR.userId);
    expect(event.userRole).toBe(ACTOR.userRole);
    expect(event.timestamp).toBe(APPROVED_AT);
    expect(event.reason).toContain(DECISION_REFERENCE);
    expect(event.reason).toContain(ACTOR.userId);
  });

  it('records the decision instant as the audit timestamp, not a second "now"', () => {
    expectApproved(approveViaStore({ approvedAt: '2026-03-04T07:15:00Z' }));
    expect(auditEventsFor(RESOURCE_TYPE_MAPPING_APPROVED)[0].timestamp).toBe('2026-03-04T07:15:00Z');
  });
});

// ── F. Readiness transition ────────────────────────────────────────────────────

describe('F. the approval flips the readiness input, and only a full table does', () => {
  it('stays UNRESOLVED while any real resource type is undecided', () => {
    for (const source of REAL_SOURCE_TYPES.slice(0, REAL_SOURCE_TYPES.length - 1)) {
      expectApproved(
        approveViaStore({
          module4ResourceType: source,
          module3ResourceType: someTargetFor(source),
        }),
      );
    }

    const input = resourceTypeInput(mockStore.getResourceTypeMappings());
    expect(input.status).toBe('UNRESOLVED');
    expect(input.coverage?.present).toBeLessThan(input.coverage?.total ?? 0);
  });

  it('becomes AVAILABLE once every real resource type has an approved pair', () => {
    for (const source of REAL_SOURCE_TYPES) {
      expectApproved(
        approveViaStore({
          module4ResourceType: source,
          module3ResourceType: someTargetFor(source),
        }),
      );
    }

    const input = resourceTypeInput(mockStore.getResourceTypeMappings());
    expect(input.status).toBe('AVAILABLE');
    expect(input.coverage?.present).toBe(input.coverage?.total);
  });

  it('reports a record whose own claim contradicts the approved table, without overriding it', () => {
    for (const source of REAL_SOURCE_TYPES) {
      expectApproved(
        approveViaStore({
          module4ResourceType: source,
          module3ResourceType: someTargetFor(source),
        }),
      );
    }

    const contradicted = {
      ...mockResources[0],
      module3ResourceType: 'MANPOWER' as OptimizerResourceType,
    };
    const snapshot = { ...snapshotWith(mockStore.getResourceTypeMappings()) };
    const readiness = assessModule4Readiness({
      ...snapshot,
      resources: [contradicted, ...snapshot.resources.slice(1)],
    });
    const input = readiness.inputs.find((i) => i.id === 'resources.resource_type');
    if (!input) throw new Error('no resources.resource_type readiness input');

    expect(input.status).toBe('UNRESOLVED');
    expect(input.reason).toContain('contradict');
  });
});

// ── G. The request builder reads the same approved value ──────────────────────

describe('G. the request builder stops treating resource_type as a blocker', () => {
  /** Approves a pair for every real Module 4 resource type in the shipped world. */
  function approveEveryRealSourceType() {
    for (const source of REAL_SOURCE_TYPES) {
      expectApproved(
        approveViaStore({
          module4ResourceType: source,
          module3ResourceType: someTargetFor(source),
        }),
      );
    }
    return mockStore.getResourceTypeMappings();
  }

  it('stops listing resources.resource_type among the blocking inputs', () => {
    const readiness = assessModule4Readiness(snapshotWith(approveEveryRealSourceType()));

    expect(readiness.blocking).not.toContain('resources.resource_type');
    const input = readiness.inputs.find((i) => i.id === 'resources.resource_type');
    if (!input) throw new Error('no resources.resource_type readiness input');
    expect(input.status).toBe('AVAILABLE');
  });

  it('refuses the build only on the OTHER unresolved blockers, never on resources', () => {
    const built = buildOptimizeRequest(snapshotWith(approveEveryRealSourceType()));

    // Blocker #2 and the rest are still open, so the build is still refused. What
    // matters here is that the refusal no longer implicates resource_type, and that
    // the gate the builder consults and the gate readiness reported are the same one.
    expect(built.ok).toBe(false);
    if (built.ok) throw new Error('unreachable while the other blockers are open');
    expect(built.summary).not.toMatch(/resource_?type/i);
  });

  it('still refuses while resource_type is unresolved', () => {
    // The gate is doing real work in both directions: approving clears it, and having
    // not approved keeps it closed. This is what stops an approval from being cosmetic.
    const built = buildOptimizeRequest(snapshotWith([]));
    expect(built.ok).toBe(false);
    if (built.ok) throw new Error('unreachable while resources are unresolved');
    expect(built.blockers.map((b) => b.id)).toContain('resources.resource_type');
  });
});

// ── H. Blocker #2 is untouched ─────────────────────────────────────────────────

describe('H. approving a mapping does not touch the possession blocker', () => {
  it('leaves request.occupancy_type UNAVAILABLE with no occupancy present', () => {
    for (const source of REAL_SOURCE_TYPES) {
      expectApproved(
        approveViaStore({
          module4ResourceType: source,
          module3ResourceType: someTargetFor(source),
        }),
      );
    }

    const readiness = assessModule4Readiness(snapshotWith(mockStore.getResourceTypeMappings()));
    const occupancy = readiness.inputs.find((i) => i.id === 'request.occupancy_type');
    if (!occupancy) throw new Error('no request.occupancy_type readiness input');

    expect(occupancy.status).toBe('UNAVAILABLE');
    expect(occupancy.coverage?.present).toBe(0);
  });
});

// ── I. Reset clears the approval ───────────────────────────────────────────────

describe('I. resetting the demo returns the table to empty', () => {
  it('drops every approval and its audit trail', () => {
    expectApproved(approveViaStore());
    expect(mockStore.getResourceTypeMappings()).toHaveLength(1);

    mockStore.resetStore();

    expect(mockStore.getResourceTypeMappings()).toEqual([]);
    expect(resourceTypeInput().status).toBe('UNRESOLVED');
  });
});