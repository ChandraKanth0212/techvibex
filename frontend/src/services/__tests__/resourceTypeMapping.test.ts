/**
 * Phase 9B-8, Decision C — AN EXPLICIT, VERSIONED MAPPING LAYER.
 *
 * The decision being defended: Module 4 keeps its operational resource
 * vocabulary, Module 3 keeps its own, and the correspondence between them is
 * reached ONLY through an approved, versioned mapping table. Phase 9B-8
 * approved the MECHANISM and approved no mapping VALUES, so the production
 * table is empty and every Module 4 resource type is unresolved.
 *
 * The tests below are therefore mostly about refusals, and each refusal is
 * checked by name so that a future relaxation has to be deliberate:
 *   - the enums share zero values, so nothing can be derived from the input
 *   - no name similarity, substring or fuzzy match
 *   - no fallback to MANPOWER / MACHINERY / any Module 3 default
 *   - a per-record value is not a substitute for the table
 *   - an unapproved or malformed table is refused rather than partially used
 *   - an approved table can be applied later with the Module 4 enum untouched
 */

import { describe, expect, it } from 'vitest';
import {
  APPROVED_RESOURCE_TYPE_MAPPINGS,
  isModule3ResourceType,
  isModule4ResourceType,
  mapResourceType,
  RESOURCE_TYPE_MAPPING_VERSION,
  resolveResourceModule3Type,
} from '@/services/resourceTypeMapping';
import { mockResources } from '@/mocks';
import { MODULE_4_RESOURCE_TYPES, type ResourceTypeMapping } from '@/types/resource';
import {
  MODULE_3_RESOURCE_TYPES,
  type OptimizerResourceType,
} from '@/types/optimizer';
import { TEST_ONLY_RESOURCE_TYPE_MAPPINGS } from './decidedWorldFixture';

/** One approved entry. Deliberately arbitrary: the mechanism is what is tested. */
function approved(
  module4ResourceType: ResourceTypeMapping['module4ResourceType'],
  module3ResourceType: OptimizerResourceType,
  mappingVersion = '2026.01',
): ResourceTypeMapping {
  return {
    module4ResourceType,
    module3ResourceType,
    mappingVersion,
    approval: {
      approvedBy: 'test-approver',
      approvedAt: '2026-01-10T00:00:00Z',
      reference: 'TEST-APPROVAL-RECORD',
    },
  };
}

describe('the two vocabularies share zero values', () => {
  it('has no overlap at all, which is why a mapping must be decided', () => {
    for (const module4 of MODULE_4_RESOURCE_TYPES) {
      expect(isModule3ResourceType(module4)).toBe(false);
    }
    for (const module3 of MODULE_3_RESOURCE_TYPES) {
      expect(isModule4ResourceType(module3)).toBe(false);
    }
    expect(MODULE_4_RESOURCE_TYPES.filter((t) => isModule3ResourceType(t))).toEqual([]);
  });

  it('exposes both vocabularies as runtime tuples for validation', () => {
    expect(MODULE_4_RESOURCE_TYPES).toHaveLength(6);
    expect(MODULE_3_RESOURCE_TYPES).toHaveLength(5);
  });
});

describe('no mapping is approved yet, so nothing resolves', () => {
  it('ships an empty production table', () => {
    expect(APPROVED_RESOURCE_TYPE_MAPPINGS).toEqual([]);
  });

  it('has no version number, because no version has been agreed', () => {
    expect(RESOURCE_TYPE_MAPPING_VERSION).toBe('UNAPPROVED');
  });

  it('leaves every Module 4 resource type UNMAPPED', () => {
    for (const module4ResourceType of MODULE_4_RESOURCE_TYPES) {
      const result = mapResourceType(module4ResourceType);
      expect(result.status).toBe('UNMAPPED');
      if (result.status !== 'UNMAPPED') throw new Error('expected UNMAPPED');
      expect(result.reason).toContain('share zero values');
      expect(result.reason).toContain('never inferred from the name');
    }
  });

  it('leaves every real mock resource unresolved', () => {
    expect(mockResources.length).toBeGreaterThan(0);
    for (const resource of mockResources) {
      expect(resolveResourceModule3Type(resource).status).toBe('UNMAPPED');
    }
  });
});

describe('there is no automatic coercion of any kind', () => {
  it('does not match on name similarity, prefix or edit distance', () => {
    // The heuristics that WOULD fire, and are refused:
    //   prefix      "MAINTENANCE_CREW" and "MACHINERY"/"MANPOWER" share "MA"
    //   substring   "MACHINE" (in TRACK_MACHINE) is a prefix of "MACHINERY"
    //   edit dist   MACHINE -> MACHINERY is two insertions
    const m4 = 'MAINTENANCE_CREW';
    const m3 = 'MACHINERY';
    expect(m4.slice(0, 2)).toBe(m3.slice(0, 2));
    expect('TRACK_MACHINE'.replace('_', '').includes(m3.slice(0, 6)));
    // ...and the mapper still refuses all of them.
    expect(mapResourceType('MAINTENANCE_CREW').status).toBe('UNMAPPED');
    expect(mapResourceType('TRACK_MACHINE').status).toBe('UNMAPPED');
  });

  it('does not fall back to MANPOWER, MACHINERY or any Module 3 default', () => {
    for (const module4ResourceType of MODULE_4_RESOURCE_TYPES) {
      const result = mapResourceType(module4ResourceType);
      expect(result.status).toBe('UNMAPPED');
      // The ONLY thing that could carry a value is a `module3ResourceType`
      // property. An UNMAPPED result has none, so no fallback is possible
      // whatever the reason text mentions.
      expect(result).not.toHaveProperty('module3ResourceType');
    }
  });

  it('refuses a source type that is not a Module 4 ResourceType at all', () => {
    const result = mapResourceType('MACHINERY' as never);
    expect(result.status).toBe('UNMAPPED');
    if (result.status !== 'UNMAPPED') throw new Error('expected UNMAPPED');
    expect(result.reason).toContain('is not a Module 4 ResourceType');
    expect(result.reason).toContain('by resemblance to a Module 3 value');
  });

  it('refuses a nonsense source type rather than producing a value', () => {
    for (const nonsense of ['', 'TRACK MACHINE', 'TRACK_MACHINE ', 'track_machine'] as never[]) {
      expect(mapResourceType(nonsense).status).toBe('UNMAPPED');
    }
  });

  it('does not let a per-record module3ResourceType bypass the table', () => {
    // A value set on one record is an unapproved assertion. Honouring it would
    // let the table be bypassed record by record.
    const result = resolveResourceModule3Type({
      resourceId: 'RES-TEST-1',
      resourceType: 'TRACK_MACHINE',
      module3ResourceType: 'MANPOWER',
    });
    expect(result.status).toBe('UNMAPPED');
    if (result.status !== 'UNMAPPED') throw new Error('expected UNMAPPED');
    expect(result.reason).toContain('no approved mapping supports it');
  });

  it('reports a per-record value that CONTRADICTS the approved table', () => {
    const table = [approved('TRACK_MACHINE', 'MACHINERY')];
    const result = resolveResourceModule3Type(
      { resourceId: 'RES-TEST-1', resourceType: 'TRACK_MACHINE', module3ResourceType: 'MANPOWER' },
      table,
    );
    expect(result.status).toBe('CONFLICT');
    if (result.status !== 'CONFLICT') throw new Error('expected CONFLICT');
    expect(result.reason).toContain('not silently overridden');
  });

  it('accepts a per-record value that AGREES with the approved table', () => {
    const table = [approved('TRACK_MACHINE', 'MACHINERY')];
    const result = resolveResourceModule3Type(
      { resourceId: 'RES-TEST-1', resourceType: 'TRACK_MACHINE', module3ResourceType: 'MACHINERY' },
      table,
    );
    expect(result.status).toBe('MAPPED');
  });

  it('leaves mock resources alone: none carries a module3ResourceType', () => {
    // The mocks were not edited to make this input pass. That is the point.
    expect(mockResources.every((r) => r.module3ResourceType === undefined)).toBe(true);
  });
});

describe('an unmapped resource type fails explicitly', () => {
  it('names the source type in the reason', () => {
    const result = mapResourceType('OHE_CREW');
    expect(result.status).toBe('UNMAPPED');
    if (result.status !== 'UNMAPPED') throw new Error('expected UNMAPPED');
    expect(result.module4ResourceType).toBe('OHE_CREW');
    expect(result.reason).toContain('OHE_CREW');
  });

  it('is a refusal value, never a thrown error and never a value', () => {
    // A pure function that reports rather than throws, so a caller can surface
    // the reason instead of catching.
    const result = mapResourceType('VEHICLE');
    expect(() => mapResourceType('VEHICLE')).not.toThrow();
    expect(result).not.toHaveProperty('module3ResourceType');
  });
});

describe('an approved mapping can be applied later', () => {
  it('maps exactly what the table approves and nothing more', () => {
    const table = [approved('TRACK_MACHINE', 'MACHINERY'), approved('SIGNAL_CREW', 'MANPOWER')];
    expect(mapResourceType('TRACK_MACHINE', table)).toMatchObject({
      status: 'MAPPED',
      module4ResourceType: 'TRACK_MACHINE',
      module3ResourceType: 'MACHINERY',
      mappingVersion: '2026.01',
    });
    expect(mapResourceType('SIGNAL_CREW', table)).toMatchObject({
      status: 'MAPPED',
      module3ResourceType: 'MANPOWER',
    });
    // Not in the table, so still unresolved.
    expect(mapResourceType('OHE_CREW', table).status).toBe('UNMAPPED');
  });

  it('carries the approval and version through to the result', () => {
    const result = mapResourceType('TRACK_MACHINE', [approved('TRACK_MACHINE', 'MACHINERY')]);
    if (result.status !== 'MAPPED') throw new Error('expected MAPPED');
    expect(result.approval.approvedBy).toBe('test-approver');
    expect(result.approval.reference).toBe('TEST-APPROVAL-RECORD');
  });

  it('changes NO Module 4 value, so the operational vocabulary is untouched', () => {
    const before = [...MODULE_4_RESOURCE_TYPES];
    mapResourceType('TRACK_MACHINE', TEST_ONLY_RESOURCE_TYPE_MAPPINGS);
    mapResourceType('OHE_CREW', TEST_ONLY_RESOURCE_TYPE_MAPPINGS);
    expect([...MODULE_4_RESOURCE_TYPES]).toEqual(before);
    // A Module 3 value is never a legal Module 4 value, before or after.
    for (const module3 of MODULE_3_RESOURCE_TYPES) {
      expect(isModule4ResourceType(module3)).toBe(false);
    }
  });

  it('resolves every mock resource when a table covers every Module 4 type', () => {
    const covered = new Set(TEST_ONLY_RESOURCE_TYPE_MAPPINGS.map((m) => m.module4ResourceType));
    for (const module4ResourceType of MODULE_4_RESOURCE_TYPES) {
      expect(covered.has(module4ResourceType)).toBe(true);
    }
    for (const resource of mockResources) {
      expect(resolveResourceModule3Type(resource, TEST_ONLY_RESOURCE_TYPE_MAPPINGS).status).toBe(
        'MAPPED',
      );
    }
  });
});

describe('an unapproved or malformed table is refused whole', () => {
  it('refuses a mapping with no approval', () => {
    const table = [
      { ...approved('TRACK_MACHINE', 'MACHINERY'), approval: undefined as never },
    ];
    const result = mapResourceType('TRACK_MACHINE', table);
    expect(result.status).toBe('INVALID_TABLE');
    if (result.status !== 'INVALID_TABLE') throw new Error('expected INVALID_TABLE');
    expect(result.reason).toContain('carries no complete approval');
  });

  it('refuses a mapping with an empty approver or reference', () => {
    const noApprover = [
      { ...approved('TRACK_MACHINE', 'MACHINERY'), approval: { approvedBy: '  ', approvedAt: 'x', reference: 'r' } },
    ];
    expect(mapResourceType('TRACK_MACHINE', noApprover).status).toBe('INVALID_TABLE');
    const noReference = [
      { ...approved('TRACK_MACHINE', 'MACHINERY'), approval: { approvedBy: 'a', approvedAt: 'x', reference: '' } },
    ];
    expect(mapResourceType('TRACK_MACHINE', noReference).status).toBe('INVALID_TABLE');
  });

  it('refuses a mapping with no version, so a decision cannot lose its attribution', () => {
    const table = [{ ...approved('TRACK_MACHINE', 'MACHINERY'), mappingVersion: '' }];
    const result = mapResourceType('TRACK_MACHINE', table);
    expect(result.status).toBe('INVALID_TABLE');
    if (result.status !== 'INVALID_TABLE') throw new Error('expected INVALID_TABLE');
    expect(result.reason).toContain('no mappingVersion');
  });

  it('refuses a source or target outside its own vocabulary', () => {
    const badSource = [approved('MATERIAL' as never, 'MACHINERY')];
    expect(mapResourceType('TRACK_MACHINE', badSource).status).toBe('INVALID_TABLE');
    const badTarget = [approved('TRACK_MACHINE', 'TRACK_MACHINE' as never)];
    const result = mapResourceType('TRACK_MACHINE', badTarget);
    expect(result.status).toBe('INVALID_TABLE');
    if (result.status !== 'INVALID_TABLE') throw new Error('expected INVALID_TABLE');
    expect(result.reason).toContain('is not a Module 3 OptimizerResourceType');
  });

  it('refuses a table that maps one source twice', () => {
    // Many-to-one is not this model: one source type, one decided target.
    const table = [approved('TRACK_MACHINE', 'MACHINERY'), approved('TRACK_MACHINE', 'MANPOWER')];
    const result = mapResourceType('TRACK_MACHINE', table);
    expect(result.status).toBe('INVALID_TABLE');
    if (result.status !== 'INVALID_TABLE') throw new Error('expected INVALID_TABLE');
    expect(result.reason).toContain('is mapped twice');
  });

  it('distinguishes a malformed table from an undecided one', () => {
    // Reporting both as "unmapped" would let a typo masquerade as an open
    // product decision.
    expect(mapResourceType('TRACK_MACHINE', []).status).toBe('UNMAPPED');
    expect(mapResourceType('TRACK_MACHINE', [approved('BAD' as never, 'MACHINERY')]).status).toBe(
      'INVALID_TABLE',
    );
  });
});

describe('determinism and purity', () => {
  it('returns identical results for identical input, whatever the table order', () => {
    const table = [approved('TRACK_MACHINE', 'MACHINERY'), approved('OHE_CREW', 'MANPOWER')];
    const reversed = [...table].reverse();
    expect(mapResourceType('TRACK_MACHINE', table)).toEqual(
      mapResourceType('TRACK_MACHINE', reversed),
    );
    expect(mapResourceType('OHE_CREW', table)).toEqual(mapResourceType('OHE_CREW', reversed));
  });

  it('does not mutate the table it was given', () => {
    const table = [approved('TRACK_MACHINE', 'MACHINERY'), approved('OHE_CREW', 'MANPOWER')];
    const before = JSON.stringify(table);
    for (const module4ResourceType of MODULE_4_RESOURCE_TYPES) {
      mapResourceType(module4ResourceType, table);
    }
    resolveResourceModule3Type(mockResources[0], table);
    expect(JSON.stringify(table)).toBe(before);
  });

  it('does not mutate the resource it was given', () => {
    const resource: Pick<
      import('@/types/resource').Resource,
      'resourceId' | 'resourceType' | 'module3ResourceType'
    > = { resourceId: 'RES-TEST-1', resourceType: 'TRACK_MACHINE' };
    const before = JSON.stringify(resource);
    resolveResourceModule3Type(resource, TEST_ONLY_RESOURCE_TYPE_MAPPINGS);
    expect(JSON.stringify(resource)).toBe(before);
    expect(resource.module3ResourceType).toBeUndefined();
  });
});
