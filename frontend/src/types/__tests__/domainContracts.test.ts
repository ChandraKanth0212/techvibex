import { describe, it, expect } from 'vitest';
import { mockIntegratedBlocks } from '@/mocks';
import type { IntegratedBlock } from '@/types/block';
import type { ExistingOccupancy } from '@/types/occupancy';
import type { MaintenanceTask } from '@/types/maintenance';
import type { Corridor } from '@/types/corridor';
import type { Resource } from '@/types/resource';
import {
  GRANTED_OCCUPANCY_STATUSES,
  type OptimizerOccupancyStatus,
  type OptimizerOccupancyType,
  type OptimizerPriorityLevel,
  type OptimizerResourceType,
  type OptimizerWorkType,
} from '@/types/optimizer';

/**
 * Phase 9B-2C domain contract tests.
 *
 * Two layers:
 *  - `@ts-expect-error` assertions, which are enforced by `tsc` (and therefore by
 *    `npm run build`). If a forbidden assignment ever starts compiling, the build
 *    breaks. These are the only way to prove a *type* refuses a value.
 *  - runtime assertions on the exported vocabularies.
 */

// ── Compile-time guards ───────────────────────────────────────────────────────

function expectPriority(_p: OptimizerPriorityLevel): void {}
function expectResource(_r: OptimizerResourceType): void {}
function expectResourceType(_r: Resource['resourceType']): void {}
function expectOccupancy(_o: ExistingOccupancy): void {}
function expectBlock(_b: IntegratedBlock): void {}

describe('explicit task priority accepts only Module 3 vocabulary', () => {
  it('accepts exactly the four Module 3 priority levels', () => {
    expectPriority('LOW');
    expectPriority('MEDIUM');
    expectPriority('HIGH');
    expectPriority('URGENT');
  });

  it('refuses Module 4 criticality values', () => {
    // @ts-expect-error CRITICAL is a Module 4 criticality, not a Module 3 priority.
    expectPriority('CRITICAL');
  });

  it('refuses Module 4 urgency and risk values that are not Module 3 priorities', () => {
    // @ts-expect-error Not a Module 3 priority level.
    expectPriority('SEVERE');
    // @ts-expect-error Not a Module 3 priority level.
    expectPriority('MAJOR');
  });
});

describe('resource vocabularies stay separate', () => {
  it('accepts Module 3 resource types on the compatibility field only', () => {
    expectResource('ENGINEERING_TRAIN');
    expectResource('MACHINERY');
    expectResource('MANPOWER');
    expectResource('MATERIAL');
    expectResource('POSSESSION');
  });

  it('refuses a Module 4 ResourceType as a Module 3 resource type', () => {
    // @ts-expect-error The two vocabularies share no value; coercion is forbidden.
    expectResource('MAINTENANCE_CREW');
    // @ts-expect-error The two vocabularies share no value; coercion is forbidden.
    expectResource('TRACK_MACHINE');
  });

  it('keeps the Module 4 ResourceType vocabulary unchanged', () => {
    expectResourceType('TRACK_MACHINE');
    expectResourceType('MAINTENANCE_CREW');
    expectResourceType('SIGNAL_CREW');
    expectResourceType('OHE_CREW');
    expectResourceType('INSPECTION_TEAM');
    expectResourceType('VEHICLE');
  });
});

const GRANTED: ExistingOccupancy = {
  occupancyId: 'OCC-001',
  corridorId: 'COR-001',
  section: 'SEC-001',
  startTime: '2026-01-12T08:00:00Z',
  endTime: '2026-01-12T10:00:00Z',
  status: 'APPROVED',
  occupancyType: 'TRAFFIC_BLOCK',
  relatedTaskIds: [],
};

describe('granted occupancy is a distinct type from IntegratedBlock', () => {
  it('accepts a well-formed possession record', () => {
    expectOccupancy(GRANTED);
  });

  it('refuses an IntegratedBlock as a possession record', () => {
    // @ts-expect-error An IntegratedBlock is a planning proposal, not granted possession.
    expectOccupancy(mockIntegratedBlocks[0]);
  });

  it('refuses a possession record as an IntegratedBlock', () => {
    // @ts-expect-error A possession record is not a planning proposal.
    expectBlock(GRANTED);
  });
});

describe('declared fields that replace a forbidden conversion', () => {
  function expectWorkType(_w: OptimizerWorkType): void {}

  it('accepts exactly the six Module 3 work types', () => {
    expectWorkType('PREVENTIVE');
    expectWorkType('CORRECTIVE');
    expectWorkType('INSPECTION');
    expectWorkType('REPAIR');
    expectWorkType('REPLACEMENT');
    expectWorkType('UPGRADE');
  });

  it('refuses values that belong to Module 4, not Module 3', () => {
    // @ts-expect-error RENOVATION is not a Module 3 work type.
    expectWorkType('RENOVATION');
    // @ts-expect-error EMERGENCY is not a Module 3 work type.
    expectWorkType('EMERGENCY');
  });

  it('leaves work_type unsatisfied rather than borrowing workType', () => {
    const task: MaintenanceTask = {
      taskId: 'TSK-1',
      assetId: 'AST-1',
      department: 'ENGINEERING',
      workType: 'RENOVATION',
      sectionId: 'SEC-1',
      location: 'Km 12',
      requestedDate: '2026-01-01',
      preferredStart: '2026-01-02T08:00:00Z',
      preferredEnd: '2026-01-02T10:00:00Z',
      durationMinutes: 120,
      criticality: 'CRITICAL',
      urgency: 'HIGH',
      overdueDays: 0,
      riskLevel: 'LOW',
      blockType: 'CORRIDOR',
      requiredResources: [],
      status: 'PENDING',
    };
    // Both are absent, and requestingDate is not promoted to a deadline.
    expect(task.module3WorkType).toBeUndefined();
    expect(task.dueBy).toBeUndefined();
    expect(task.requestedDate).toBe('2026-01-01');
  });

  it('leaves a corridor unnamed rather than joining its station names', () => {
    const corridor: Corridor = {
      corridorId: 'COR-001',
      sectionId: 'SEC-001',
      fromStation: 'Station A',
      toStation: 'Station B',
      line: 'UP',
      date: '2026-01-01',
      availableWindows: [],
      restrictions: [],
      capacity: 1,
      status: 'OPERATIONAL',
    };
    expect(corridor.name).toBeUndefined();
  });
});

// ── Runtime guards ────────────────────────────────────────────────────────────

describe('occupancy vocabularies match the frozen Module 3 contract', () => {
  it('counts only possession that is actually in force as granted', () => {
    expect(GRANTED_OCCUPANCY_STATUSES).toEqual(['APPROVED', 'ACTIVE']);
  });

  it('excludes an intention and a withdrawal from granted possession', () => {
    expect(GRANTED_OCCUPANCY_STATUSES).not.toContain('PLANNED');
    expect(GRANTED_OCCUPANCY_STATUSES).not.toContain('CANCELLED');
  });

  it('accepts every Module 3 occupancy type and status verbatim', () => {
    const types: OptimizerOccupancyType[] = [
      'TRAFFIC_BLOCK',
      'POSSESSION',
      'SLOW_MOVEMENT',
    ];
    const statuses: OptimizerOccupancyStatus[] = [
      'PLANNED',
      'APPROVED',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
    ];
    expect(types).toHaveLength(3);
    expect(statuses).toHaveLength(5);
  });
});

describe('new domain fields are optional, so existing records stay valid', () => {
  it('accepts a MaintenanceTask with no explicit priority', () => {
    const task: MaintenanceTask = {
      taskId: 'TSK-1',
      assetId: 'AST-1',
      department: 'ENGINEERING',
      workType: 'INSPECTION',
      sectionId: 'SEC-1',
      location: 'Km 12',
      requestedDate: '2026-01-01',
      preferredStart: '2026-01-02T08:00:00Z',
      preferredEnd: '2026-01-02T10:00:00Z',
      durationMinutes: 120,
      criticality: 'CRITICAL',
      urgency: 'HIGH',
      overdueDays: 0,
      riskLevel: 'LOW',
      blockType: 'CORRIDOR',
      requiredResources: [],
      status: 'PENDING',
    };
    expect(task.priority).toBeUndefined();
    expect(task.criticality).toBe('CRITICAL');
  });

  it('accepts a Resource with no Module 3 compatibility recorded', () => {
    const resource: Resource = {
      resourceId: 'RES-1',
      department: 'ENGINEERING',
      resourceType: 'TRACK_MACHINE',
      name: 'Machine 1',
      availabilityWindows: [],
      currentLocation: 'Yard',
      status: 'AVAILABLE',
    };
    expect(resource.module3ResourceType).toBeUndefined();
    expect(resource.resourceType).toBe('TRACK_MACHINE');
  });
});
