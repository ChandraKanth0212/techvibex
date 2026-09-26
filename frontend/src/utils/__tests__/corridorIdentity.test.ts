import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mockAssets,
  mockBlockRequests,
  mockCorridors,
  mockGoodsForecasts,
  mockIntegratedBlocks,
  mockMaintenanceTasks,
  mockTrains,
} from '@/mocks';
import type { MaintenanceTask } from '@/types/maintenance';
import type { BlockRequest, IntegratedBlock } from '@/types/block';
import type { Asset } from '@/types/asset';
import type { GoodsForecast, Train } from '@/types/train';
import type { Corridor } from '@/types/corridor';
import type { CorridorBearing } from '@/types/corridorIdentity';
import {
  buildCorridorTopology,
  explicitCorridorSelection,
  resolveCorridorIdentity,
  syntheticDemoCorridorIdentity,
} from '@/utils/corridorIdentity';

const CORRIDOR_ID = 'CORR-001';
const SECTION_ID = 'SEC-SCD-KCG';

function makeTask(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    taskId: 'TSK-900',
    assetId: 'AST-001',
    department: 'ENGINEERING',
    workType: 'Rail machining',
    sectionId: SECTION_ID,
    location: 'Bridge 14',
    requestedDate: '2026-09-25',
    preferredStart: '2026-09-25T01:30:00Z',
    preferredEnd: '2026-09-25T04:00:00Z',
    durationMinutes: 150,
    criticality: 'HIGH',
    urgency: 'MEDIUM',
    overdueDays: 0,
    riskLevel: 'MEDIUM',
    blockType: 'CORRIDOR',
    requiredResources: [],
    status: 'PENDING',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<BlockRequest> = {}): BlockRequest {
  return {
    requestId: 'BRQ-900',
    taskId: 'TSK-900',
    department: 'ENGINEERING',
    sectionId: SECTION_ID,
    requestedDate: '2026-09-25',
    preferredStart: '2026-09-25T01:30:00Z',
    preferredEnd: '2026-09-25T04:00:00Z',
    durationMinutes: 150,
    blockType: 'CORRIDOR',
    priority: 3,
    status: 'PENDING',
    submittedAt: '2026-09-25T00:00:00Z',
    ...overrides,
  };
}

function makeBlock(overrides: Partial<IntegratedBlock> = {}): IntegratedBlock {
  return {
    blockId: 'BLK-900',
    date: '2026-09-25',
    sectionId: SECTION_ID,
    fromStation: 'SECUNDERABAD',
    toStation: 'KACHEGUDA',
    startTime: '2026-09-25T01:30:00Z',
    endTime: '2026-09-25T04:00:00Z',
    durationMinutes: 150,
    departments: ['ENGINEERING'],
    taskIds: ['TSK-900'],
    requestIds: ['BRQ-900'],
    status: 'AI_PROPOSED',
    constraintValidation: {
      corridorAvailable: true,
      requiredDurationSatisfied: true,
      passengerTrainConflict: false,
      goodsTrainConflict: false,
      resourceConflict: false,
      locationConflict: false,
      dependencyConflict: false,
      overallFeasible: true,
    },
    operationalImpact: {
      trainsAffectedCount: 0,
      totalDelayMinutes: 0,
      estimatedFreightThroughputImpact: 'NONE',
      safetyRiskIndex: 0,
    },
    source: 'MANUAL',
    ...overrides,
  };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    assetId: 'AST-900',
    department: 'ENGINEERING',
    assetType: 'TRACK',
    sectionId: SECTION_ID,
    location: 'Bridge 14',
    criticality: 'HIGH',
    condition: 'FAIR',
    status: 'OPERATIONAL',
    lastMaintenanceDate: '2026-08-01',
    nextMaintenanceDue: '2026-10-01',
    ...overrides,
  };
}

function makeTrain(overrides: Partial<Train> = {}): Train {
  return {
    trainId: 'TRN-900',
    trainNumber: 'D005',
    trainType: 'EXPRESS',
    sectionId: SECTION_ID,
    direction: 'UP',
    arrivalTime: '2026-09-25T01:45:00Z',
    departureTime: '2026-09-25T01:55:00Z',
    operationalPriority: 1,
    status: 'SCHEDULED',
    ...overrides,
  };
}

function makeForecast(overrides: Partial<GoodsForecast> = {}): GoodsForecast {
  return {
    forecastId: 'GFC-900',
    sectionId: SECTION_ID,
    expectedTime: '2026-09-25T02:45:00Z',
    probability: 0.82,
    trainType: 'GOODS',
    confidence: 'HIGH',
    source: 'FREIGHT_FOIS_FEED',
    status: 'PROJECTED',
    ...overrides,
  };
}

const topology = buildCorridorTopology(mockCorridors);

describe('corridorId survives domain-model construction', () => {
  it('is accepted and preserved on every Module 3 corridor-bearing entity', () => {
    const task = makeTask({ corridorId: CORRIDOR_ID });
    const request = makeRequest({ corridorId: CORRIDOR_ID });
    const block = makeBlock({ corridorId: CORRIDOR_ID });
    const asset = makeAsset({ corridorId: CORRIDOR_ID });
    const train = makeTrain({ corridorId: CORRIDOR_ID });
    const forecast = makeForecast({ corridorId: CORRIDOR_ID });

    expect(task.corridorId).toBe(CORRIDOR_ID);
    expect(request.corridorId).toBe(CORRIDOR_ID);
    expect(block.corridorId).toBe(CORRIDOR_ID);
    expect(asset.corridorId).toBe(CORRIDOR_ID);
    expect(train.corridorId).toBe(CORRIDOR_ID);
    expect(forecast.corridorId).toBe(CORRIDOR_ID);
  });

  it('stays optional: entities build without corridorId and report undefined', () => {
    expect(makeTask().corridorId).toBeUndefined();
    expect(makeRequest().corridorId).toBeUndefined();
    expect(makeBlock().corridorId).toBeUndefined();
    expect(makeAsset().corridorId).toBeUndefined();
    expect(makeTrain().corridorId).toBeUndefined();
    expect(makeForecast().corridorId).toBeUndefined();
  });

  it('keeps corridorId independent of sectionId', () => {
    const entity: CorridorBearing = {
      corridorId: CORRIDOR_ID,
      sectionId: 'SEC-UNRELATED-99',
    };
    expect(resolveCorridorIdentity(entity, topology).corridorId).toBe(CORRIDOR_ID);
  });
});

describe('corridorId survives service and adapter transformations', () => {
  it('performs no field projection on the repository path', async () => {
    const { maintenanceService } = await import('@/services/maintenanceService');
    const assets = await maintenanceService.getAssets();
    // Identical object references prove the service copies nothing, so an
    // optional corridorId can never be dropped on the way out.
    expect(assets[0]).toBe(mockAssets[0]);
  });

  it('preserves every domain field on the mutable store path', async () => {
    const { maintenanceService } = await import('@/services/maintenanceService');
    const tasks = await maintenanceService.getMaintenanceTasks();
    expect(tasks).toEqual(mockMaintenanceTasks);
    const source = new Map(mockMaintenanceTasks.map((t) => [t.taskId, t]));
    for (const task of tasks) {
      const origin = source.get(task.taskId);
      expect(origin).toBeDefined();
      expect(Object.keys(task).sort()).toEqual(Object.keys(origin!).sort());
    }
  });

  it('keeps a corridorId attached to a real mock record', async () => {
    const { maintenanceService } = await import('@/services/maintenanceService');
    const template = mockMaintenanceTasks[0];
    const withCorridor = { ...template, corridorId: CORRIDOR_ID };
    const readBack = (await maintenanceService.getMaintenanceTasks()).find(
      (t) => t.taskId === withCorridor.taskId,
    );
    expect(readBack).toBeDefined();
    expect(resolveCorridorIdentity({ ...readBack!, corridorId: withCorridor.corridorId }).corridorId).toBe(
      CORRIDOR_ID,
    );
  });

  it('passes through the corridor service lookup', async () => {
    const { corridorService } = await import('@/services/corridorService');
    const found = await corridorService.getCorridor(CORRIDOR_ID);
    expect(found?.corridorId).toBe(CORRIDOR_ID);
  });

  it('survives the planner detail projection as a scalar field', async () => {
    const { toDetailEntries } = await import('@/utils/plannerScope');
    const task = makeTask({ corridorId: CORRIDOR_ID });
    const entries = toDetailEntries(task);
    const corridorEntry = entries.find(([key]) => key === 'corridorId');
    expect(corridorEntry).toBeDefined();
    expect(corridorEntry?.[1]).toBe(CORRIDOR_ID);
  });

  it('omits corridorId from the projection only when the entity lacks it', async () => {
    const { toDetailEntries } = await import('@/utils/plannerScope');
    const entries = toDetailEntries(makeTask());
    expect(entries.find(([key]) => key === 'corridorId')).toBeUndefined();
  });
});

describe('missing corridorId is represented as unavailable', () => {
  it('reports UNAVAILABLE_FROM_MODULE_4 with a null corridorId', () => {
    const identity = resolveCorridorIdentity({ sectionId: SECTION_ID }, topology);
    expect(identity.corridorId).toBeNull();
    expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(identity.reason).toContain(
      'section ownership is not an explicit corridor reference',
    );
  });

  it('explains the absence when no corridor claims the section', () => {
    const identity = resolveCorridorIdentity({ sectionId: 'SEC-NOT-IN-REGISTER' });
    expect(identity.corridorId).toBeNull();
    expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(identity.reason).toContain('unavailable from Module 4');
  });

  it('reports unavailable for an entity with neither corridorId nor sectionId', () => {
    const identity = resolveCorridorIdentity({}, topology);
    expect(identity.corridorId).toBeNull();
    expect(identity.sectionId).toBeNull();
    expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    expect(identity.candidateCorridorId).toBeNull();
  });

  it('treats a blank corridorId as absent rather than mapped', () => {
    for (const blank of ['', '   ']) {
      const identity = resolveCorridorIdentity(
        { corridorId: blank, sectionId: SECTION_ID },
        topology,
      );
      expect(identity.corridorId).toBeNull();
      expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    }
  });

  it('labels Module 3 synthetic-demo corridors separately', () => {
    const identity = syntheticDemoCorridorIdentity('COR-001', 'COR-001-S1');
    expect(identity.corridorId).toBe('COR-001');
    expect(identity.source).toBe('MODULE_3_SYNTHETIC_DEMO');
    expect(identity.reason).toContain('not real railway data');
  });

  it('labels an explicit operator selection as mapped from Module 4', () => {
    const identity = explicitCorridorSelection(CORRIDOR_ID, mockCorridors[0]);
    expect(identity.corridorId).toBe(CORRIDOR_ID);
    expect(identity.sectionId).toBe(SECTION_ID);
    expect(identity.source).toBe('MAPPED_FROM_MODULE_4');
  });

  it('reports an unselected planner corridor as unavailable', () => {
    expect(explicitCorridorSelection(null).source).toBe(
      'UNAVAILABLE_FROM_MODULE_4',
    );
  });
});

describe('sectionId alone does NOT generate corridorId', () => {
  it('does not parse the Module 3 "COR-001-S1" section prefix', () => {
    const identity = resolveCorridorIdentity({ sectionId: 'COR-001-S1' }, topology);
    expect(identity.corridorId).toBeNull();
    expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
  });

  it('does not promote section ownership to a corridorId', () => {
    const identity = resolveCorridorIdentity({ sectionId: SECTION_ID }, topology);
    expect(identity.corridorId).toBeNull();
    expect(identity.candidateCorridorId).toBe(CORRIDOR_ID);
    expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
  });

  it('does not derive a corridorId for any mock entity', () => {
    const entities: CorridorBearing[] = [
      ...mockMaintenanceTasks,
      ...mockBlockRequests,
      ...mockAssets,
      ...mockTrains,
      ...mockGoodsForecasts,
      ...mockIntegratedBlocks,
    ];
    for (const entity of entities) {
      const identity = resolveCorridorIdentity(entity, topology);
      expect(identity.corridorId).toBeNull();
      expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
    }
  });

  it('is unaffected by sectionId when an explicit corridorId is present', () => {
    const identity = resolveCorridorIdentity(
      { corridorId: CORRIDOR_ID, sectionId: 'COR-001-S1' },
      topology,
    );
    expect(identity.corridorId).toBe(CORRIDOR_ID);
    expect(identity.source).toBe('MAPPED_FROM_MODULE_4');
  });

  it('contains no id-parsing operations on sectionId', () => {
    const source = readFileSync(
      new URL('../corridorIdentity.ts', import.meta.url),
      'utf8',
    );
    const body = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*'))
      .join('\n');
    for (const forbidden of ['.split(', '.slice(', '.substring(', '.substr(', '.replace(', '.match(', 'indexOf']) {
      expect(body, `corridorIdentity.ts must not call ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});

describe('corridor topology reflects Module 4 data only', () => {
  it('maps every mock corridor to its declared section', () => {
    for (const corridor of mockCorridors) {
      expect(topology.byCorridorId.get(corridor.corridorId)).toBe(
        corridor.sectionId,
      );
      expect(topology.bySectionId.get(corridor.sectionId)).toEqual([
        corridor.corridorId,
      ]);
    }
  });

  it('yields no candidate when a section is claimed by several corridors', () => {
    const shared: Corridor[] = [
      { ...mockCorridors[0], corridorId: 'CORR-100' },
      { ...mockCorridors[1], corridorId: 'CORR-101', sectionId: SECTION_ID },
    ];
    const ambiguous = buildCorridorTopology(shared);
    const identity = resolveCorridorIdentity({ sectionId: SECTION_ID }, ambiguous);
    expect(identity.corridorId).toBeNull();
    expect(identity.candidateCorridorId).toBeNull();
    expect(identity.source).toBe('UNAVAILABLE_FROM_MODULE_4');
  });

  it('ignores corridors with blank ids', () => {
    const blank = buildCorridorTopology([
      { ...mockCorridors[0], corridorId: '  ' },
    ]);
    expect(blank.byCorridorId.size).toBe(0);
    expect(blank.bySectionId.size).toBe(0);
  });
});

describe('existing mocks remain valid and unaltered', () => {
  const datasets: [string, { sectionId: string; corridorId?: string }[]][] = [
    ['maintenanceTasks', mockMaintenanceTasks],
    ['blockRequests', mockBlockRequests],
    ['assets', mockAssets],
    ['trains', mockTrains],
    ['goodsForecasts', mockGoodsForecasts],
    ['integratedBlocks', mockIntegratedBlocks],
  ];

  it('keeps dataset counts unchanged', () => {
    expect(mockMaintenanceTasks).toHaveLength(24);
    expect(mockBlockRequests).toHaveLength(18);
    expect(mockAssets).toHaveLength(24);
    expect(mockTrains).toHaveLength(20);
    expect(mockGoodsForecasts).toHaveLength(10);
    expect(mockIntegratedBlocks).toHaveLength(8);
    expect(mockCorridors).toHaveLength(5);
  });

  it('invents no corridorId: no mock record carries one', () => {
    for (const [name, rows] of datasets) {
      for (const row of rows) {
        expect(
          row.corridorId,
          `${name} record must not carry an invented corridorId`,
        ).toBeUndefined();
      }
    }
  });

  it('still references only sections declared by a mock corridor', () => {
    const knownSections = new Set(mockCorridors.map((c) => c.sectionId));
    for (const [name, rows] of datasets) {
      for (const row of rows) {
        expect(knownSections.has(row.sectionId), `${name} section`).toBe(true);
      }
    }
  });

  it('passes the barrel-level mock validation', async () => {
    const { getMockDataValidationErrors } = await import('@/mocks');
    expect(getMockDataValidationErrors()).toEqual([]);
  });
});
