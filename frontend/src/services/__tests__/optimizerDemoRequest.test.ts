import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MODULE_3_DEFAULT_FIELDS,
  SYNTHETIC_DEMO_DATA_MODE,
  SYNTHETIC_DEMO_FIXTURE_SHA256,
  SYNTHETIC_DEMO_SEED,
  SYNTHETIC_DEMO_SOURCE,
  SYNTHETIC_DEMO_STORAGE,
  UNAVAILABLE_MODULE4_FIELDS,
  buildSyntheticDemoOptimizeRequest,
  describeSyntheticDemoProvenance,
  readSyntheticDemoFixture,
} from '@/services/optimizerDemoRequest';
import { UNRESOLVED_OPTIMIZER_MAPPINGS } from '@/types/optimizer';

/** Module 3 enum vocabularies, transcribed from the published contract. */
const ENUMS = {
  occupancyType: ['TRAFFIC_BLOCK', 'POSSESSION', 'SLOW_MOVEMENT'],
  priorityLevel: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
  workType: ['PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'REPAIR', 'REPLACEMENT', 'UPGRADE'],
  assetType: ['TRACK', 'OHE', 'SIGNALLING', 'BRIDGE', 'TUNNEL', 'STATION', 'OTHER'],
  severityLevel: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  resourceType: ['POSSESSION', 'ENGINEERING_TRAIN', 'MACHINERY', 'MANPOWER', 'MATERIAL'],
  trainDirection: ['UP', 'DOWN', 'BOTH'],
  blockStatus: ['PLANNED', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
} as const;

type Dict = Record<string, unknown>;

const CONTEXT_KEYS = [
  'assets',
  'block_requests',
  'corridors',
  'defects',
  'existing_blocks',
  'goods_forecasts',
  'horizon_end',
  'horizon_start',
  'priorities',
  'resources',
  'tasks',
  'train_movements',
] as const;

/** Compact + key-sorted JSON, matching how the pinned sha256 was produced. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const source = value as Dict;
  const entries = Object.keys(source)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(source[key])}`);
  return `{${entries.join(',')}}`;
}

function rows(value: unknown): Dict[] {
  return Array.isArray(value) ? (value as Dict[]) : [];
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

const fixture = readSyntheticDemoFixture() as unknown as Dict;
const context = fixture.context as Dict;
const request = fixture.request as Dict;

describe('synthetic payload shape', () => {
  it('is exactly the body POST /api/optimizer/generate accepts', () => {
    expect(Object.keys(fixture).sort()).toEqual(['context', 'request', 'settings']);
    expect(Object.keys(context).sort()).toEqual([...CONTEXT_KEYS]);
  });

  it('stays snake_case on the wire (no camelCase keys anywhere)', () => {
    const offenders: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((entry, i) => walk(entry, `${path}[${i}]`));
        return;
      }
      if (value === null || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value as Dict)) {
        if (/[A-Z]/.test(key)) offenders.push(`${path}.${key}`);
        walk(child, `${path}.${key}`);
      }
    };
    walk(fixture, '$');
    expect(offenders).toEqual([]);
  });

  it('carries the Module 3 request fields that are required, all non-empty', () => {
    for (const key of ['request_id', 'corridor_id', 'section']) {
      expect(isNonEmptyString(request[key]), `${key} must be a non-empty string`).toBe(true);
    }
    for (const key of ['requested_start', 'requested_end']) {
      expect(isNonEmptyString(request[key]), `${key} must be an ISO datetime`).toBe(true);
    }
    expect(Array.isArray(request.task_ids)).toBe(true);
    expect((request.task_ids as string[]).length).toBeGreaterThan(0);
  });

  it('carries the Module 3 task fields that are required, all non-empty', () => {
    for (const task of rows(context.tasks)) {
      for (const key of ['task_id', 'asset_id', 'corridor_id', 'work_type']) {
        expect(isNonEmptyString(task[key]), `task.${key} must be non-empty`).toBe(true);
      }
      expect(typeof task.estimated_duration_minutes).toBe('number');
      expect(task.estimated_duration_minutes as number).toBeGreaterThan(0);
    }
  });

  it('uses only documented Module 3 enum values', () => {
    for (const task of rows(context.tasks)) {
      expect(ENUMS.workType).toContain(task.work_type);
      expect(ENUMS.priorityLevel).toContain(task.priority);
    }
    for (const request_ of rows(context.block_requests)) {
      expect(ENUMS.occupancyType).toContain(request_.occupancy_type);
    }
    for (const corridor of rows(context.corridors)) {
      expect(isNonEmptyString(corridor.name)).toBe(true);
    }
    for (const asset of rows(context.assets)) {
      expect(ENUMS.assetType).toContain(asset.asset_type);
    }
    for (const defect of rows(context.defects)) {
      expect(ENUMS.severityLevel).toContain(defect.severity);
    }
    for (const resource of rows(context.resources)) {
      expect(ENUMS.resourceType).toContain(resource.resource_type);
    }
    for (const movement of rows(context.train_movements)) {
      expect(ENUMS.trainDirection).toContain(movement.direction);
      for (const key of ['movement_id', 'train_number', 'corridor_id', 'section']) {
        expect(isNonEmptyString(movement[key]), `movement.${key} must be non-empty`).toBe(true);
      }
    }
    for (const block of rows(context.existing_blocks)) {
      expect(ENUMS.blockStatus).toContain(block.status);
    }
  });

  it('sends settings as an explicit all-null block, so Module 3 applies its own defaults', () => {
    const settings = fixture.settings as Dict;
    expect(settings).not.toBeNull();
    for (const value of Object.values(settings)) expect(value).toBeNull();
  });

  it('has referential integrity: tasks resolve to real corridors, assets and resources', () => {
    const corridorIds = new Set(rows(context.corridors).map((c) => c.corridor_id));
    const assetIds = new Set(rows(context.assets).map((a) => a.asset_id));
    const resourceIds = new Set(rows(context.resources).map((r) => r.resource_id));
    const tasks = rows(context.tasks);

    for (const task of tasks) {
      expect(corridorIds.has(task.corridor_id as string)).toBe(true);
      expect(assetIds.has(task.asset_id as string)).toBe(true);
      for (const resource of (task.required_resources as string[]) ?? []) {
        expect(resourceIds.has(resource)).toBe(true);
      }
    }

    const taskIds = new Set(tasks.map((t) => t.task_id));
    for (const id of request.task_ids as string[]) expect(taskIds.has(id)).toBe(true);
  });

  it('scopes the request to a single task inside the wider demo world', () => {
    expect((request.task_ids as string[]).length).toBe(1);
    expect(rows(context.tasks).length).toBeGreaterThan(1);
    expect(isNonEmptyString(context.horizon_start)).toBe(true);
    expect(isNonEmptyString(context.horizon_end)).toBe(true);
  });
});

describe('synthetic payload determinism', () => {
  it('matches the pinned sha256 of the Module 3 output file', () => {
    const bytes = readFileSync(new URL('../__fixtures__/module3SyntheticDemo.json', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SYNTHETIC_DEMO_FIXTURE_SHA256);
  });

  it('builds a deeply equal payload on every call', () => {
    expect(buildSyntheticDemoOptimizeRequest()).toEqual(buildSyntheticDemoOptimizeRequest());
  });

  it('hands out an independent copy so a caller cannot corrupt the fixture', () => {
    const first = buildSyntheticDemoOptimizeRequest() as unknown as Dict;
    (first.context as Dict).tasks = [];
    delete first.request;

    const second = buildSyntheticDemoOptimizeRequest() as unknown as Dict;
    expect(rows((second.context as Dict).tasks).length).toBeGreaterThan(0);
    expect(second.request).toBeDefined();
  });
});

describe('synthetic payload provenance', () => {
  const provenance = describeSyntheticDemoProvenance();

  it('marks the payload SYNTHETIC_DEMO / IN_MEMORY and names its source', () => {
    expect(provenance.dataMode).toBe(SYNTHETIC_DEMO_DATA_MODE);
    expect(provenance.storage).toBe(SYNTHETIC_DEMO_STORAGE);
    expect(provenance.source).toBe(SYNTHETIC_DEMO_SOURCE);
    expect(provenance.seed).toBe(SYNTHETIC_DEMO_SEED);
  });

  it('never claims Module 4 data contributed', () => {
    expect(provenance.containsModule4Data).toBe(false);
    expect(provenance.entries.some((e) => e.label === 'MAPPED_FROM_MODULE_4')).toBe(false);
  });

  it('exposes all four provenance labels the UI needs to distinguish', () => {
    const labels = new Set(provenance.entries.map((entry) => entry.label));
    expect(labels.has('MODULE_3_SYNTHETIC_DEMO')).toBe(true);
    expect(labels.has('MODULE_3_DEFAULT')).toBe(true);
    expect(labels.has('UNAVAILABLE_FROM_MODULE_4')).toBe(true);
  });

  it('labels every shipped context collection as synthetic, with a real count', () => {
    const collections = provenance.entries.filter((entry) => entry.field.startsWith('context.'));
    for (const name of ['tasks', 'corridors', 'assets', 'defects', 'resources', 'train_movements']) {
      const entry = collections.find((e) => e.field === `context.${name}`);
      expect(entry?.label, `${name} must be labelled synthetic`).toBe('MODULE_3_SYNTHETIC_DEMO');
      expect(entry?.count).toBe(rows((context as Dict)[name]).length);
    }
  });

  it('records corridor_id as unavailable rather than deriving it', () => {
    const ids = UNAVAILABLE_MODULE4_FIELDS.map((entry) => entry.field);
    expect(ids).toContain('request.corridor_id');
    expect(ids).toContain('context.tasks[].corridor_id');
    expect(UNAVAILABLE_MODULE4_FIELDS.every((entry) => entry.label === 'UNAVAILABLE_FROM_MODULE_4')).toBe(true);
    expect(UNAVAILABLE_MODULE4_FIELDS.some((entry) => entry.reason.includes('Deriving corridorId from sectionId'))).toBe(true);
  });

  it('records the remaining blocked fields instead of filling them', () => {
    const ids = UNAVAILABLE_MODULE4_FIELDS.map((entry) => entry.field);
    expect(ids).toContain('context.train_movements[].movement_id');
    expect(ids).toContain('context.goods_forecasts[].window_start');
    expect(ids).toContain('context.corridors[].name');
    expect(ids).toContain('context.existing_blocks');
    expect(ids).toContain('context.priorities');
    expect(ids).toContain('context.resources[].resource_type');
  });

  it('records Module 3 defaults that apply because Module 4 supplied nothing', () => {
    const fields = MODULE_3_DEFAULT_FIELDS.map((entry) => entry.field);
    expect(fields).toContain('request.occupancy_type');
    expect(fields).toContain('context.tasks[].priority');
    expect(fields).toContain('settings');
    const occupancy = MODULE_3_DEFAULT_FIELDS.find((e) => e.field === 'request.occupancy_type');
    expect(occupancy?.reason).toContain('must NOT be mapped');
  });

  it('warns that the result is synthetic and not real railway data', () => {
    expect(provenance.warnings.join(' ')).toContain('SYNTHETIC_DEMO');
    expect(provenance.warnings.join(' ')).toContain('not real railway data');
  });

  it('reports the real single-task scope', () => {
    expect(provenance.scope.requestId).toBe('BRQ-TSK-001');
    expect(provenance.scope.taskIds).toEqual(['TSK-001']);
    expect(provenance.scope.corridorId).toBe('COR-001');
    expect(provenance.scope.section).toBe('COR-001-S1');
  });
});

describe('unresolved mappings are not performed by the synthetic path', () => {
  it('keeps every Phase 9B forbidden conversion on the unresolved list', () => {
    const ids = UNRESOLVED_OPTIMIZER_MAPPINGS.map((mapping) => mapping.id);
    for (const id of [
      'block_type',
      'objective_value',
      'violation_severity',
      'urgent_task',
      'risk_to_priority',
      'confidence_to_score',
      'criticality_to_priority',
      'requested_date_to_due_by',
    ]) {
      expect(ids, `${id} must stay unresolved`).toContain(id);
    }
    expect(UNRESOLVED_OPTIMIZER_MAPPINGS.every((mapping) => mapping.status === 'UNRESOLVED')).toBe(true);
  });

  it('invents no Module 4 priority: the request carries no priority field', () => {
    // BlockRequest has no priority in Module 3; the fixture must not add one.
    expect(request).not.toHaveProperty('priority');
    expect(request).not.toHaveProperty('criticality');
    expect(request).not.toHaveProperty('urgency');
    expect(request).not.toHaveProperty('risk');
  });

  it('sends no Module 4 field name that a mapping would have had to invent', () => {
    // Module 4 names are camelCase; Module 3 names are snake_case. Asserting on
    // the specific Module 4 field names documents the intent precisely, whereas
    // Module 3's own fields (due_by, confidence, priority_score) legitimately
    // appear because Module 3's demo populated them - not because Module 4
    // supplied them.
    const serialized = canonicalize(fixture);
    const module4Names = [
      'blockType',
      'efficiencyScore',
      'criticality',
      'urgency',
      'riskLevel',
      'overdueDays',
      'sectionId',
      'taskId',
      'assetId',
      'requestedDate',
      'dueBy',
    ];
    for (const name of module4Names) {
      expect(serialized, `${name} is a Module 4 field and must not appear in the request`).not.toContain(name);
    }
  });

  it('carries due_by only as Module 3 synthetic data, never as a Module 4 requestedDate mapping', () => {
    const tasks = rows(context.tasks);
    const withDueBy = tasks.filter((task) => task.due_by !== null);
    expect(withDueBy.length).toBeGreaterThan(0);
    // Every such value is Module 3's own demo output, and none is traceable to a
    // Module 4 requestedDate: the payload carries no Module 4 task at all.
    for (const task of withDueBy) {
      expect(task).not.toHaveProperty('requestedDate');
      expect(task).not.toHaveProperty('requested_date');
    }
    expect(UNRESOLVED_OPTIMIZER_MAPPINGS.some((m) => m.id === 'requested_date_to_due_by')).toBe(true);
  });
});
