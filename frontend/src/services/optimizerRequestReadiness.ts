/**
 * RailOpt Module 4 – Optimizer Request Readiness (Phase 9B-2B)
 *
 * Answers one question: given the current Module 4 domain data plus the current
 * `PlannerScope`, can a legitimate Module 3 optimizer request be constructed?
 *
 * THIS MODULE BUILDS NOTHING. It performs no network call, constructs no
 * payload, and returns no request body. It reports, per required Module 3 input,
 * whether a trustworthy Module 4 source exists for it. The actual request
 * builder is a later phase and stays blocked until these gaps are closed with
 * real data rather than with inference.
 *
 * WHAT THIS MODULE REFUSES TO DO
 * ------------------------------
 *   - Derive `corridorId` from `sectionId`. Section ids are opaque: Module 4 uses
 *     `SEC-SCD-KCG`, Module 3 uses `COR-001-S1`, and neither encodes the other.
 *     Corridor resolution is delegated to `resolveCorridorIdentity`, which only
 *     honours an explicit field.
 *   - Treat a `PlannerScope` corridor selection as a corridor assignment for the
 *     entities on screen. The selection scopes the *request*; it says nothing
 *     about which corridor an individual task, train or asset belongs to.
 *   - Promote a proposed `IntegratedBlock` into a Module 3 `ExistingBlock`.
 *   - Map Module 4 `BlockType` to a Module 3 `occupancy_type`.
 *   - Map Module 4 `criticality`/`urgency` to a Module 3 `priority`.
 *   - Map a Module 4 `objectiveValue` to an `efficiencyScore`.
 *   - Fill a missing required field with a placeholder, a default, or a guess.
 *     A missing field stays `UNAVAILABLE_FROM_MODULE_4` and is reported as such.
 *
 * The Module 3 `SYNTHETIC_DEMO` path is a separate, valid route to READY and is
 * never mixed with Module 4 provenance.
 */

import {
  UNRESOLVED_OPTIMIZER_MAPPINGS,
  GRANTED_OCCUPANCY_STATUSES,
  type OptimizerDataMode,
  type UnresolvedMapping,
} from '@/types/optimizer';
// Type-only import: `optimizerDemoRequest` statically imports the 212 kB demo
// fixture, so importing any runtime value from it would defeat tree-shaking.
import type { OptimizerProvenanceLabel } from './optimizerDemoRequest';
import { buildCorridorTopology, resolveCorridorIdentity } from '@/utils/corridorIdentity';
import {
  plannerScopeIdentity,
  plannerScopeTaskIds,
  type PlannerScope,
} from '@/utils/plannerScope';
import type { MaintenanceTask } from '@/types/maintenance';
import type { BlockRequest, IntegratedBlock } from '@/types/block';
import type { ExistingOccupancy } from '@/types/occupancy';
import type { Asset } from '@/types/asset';
import type { GoodsForecast, Train } from '@/types/train';
import type { Resource } from '@/types/resource';
import type { Corridor } from '@/types/corridor';
import type { AIRecommendation } from '@/types/ai';

// ── Frozen Module 3 contract facts ────────────────────────────────────────────
// Read from Module 3's own vendored demo payload. These are the vocabularies a
// real request must satisfy; recorded here so readiness can compare against them
// without loading the fixture.
const MODULE_3_RESOURCE_TYPES = [
  'ENGINEERING_TRAIN',
  'MACHINERY',
  'MANPOWER',
  'MATERIAL',
  'POSSESSION',
] as const;

const MODULE_3_TASK_PRIORITIES = ['HIGH', 'LOW', 'MEDIUM', 'URGENT'] as const;

/** Module 3 `OccupancyType`, from its compiled contract. */
const MODULE_3_OCCUPANCY_TYPES = ['POSSESSION', 'SLOW_MOVEMENT', 'TRAFFIC_BLOCK'] as const;

/**
 * Module 3 `WorkType`, extracted from its compiled contract. `work_type` carries
 * no default there, so unlike `priority` it cannot be left to Module 3.
 */
const MODULE_3_WORK_TYPES = [
  'CORRECTIVE',
  'INSPECTION',
  'PREVENTIVE',
  'REPAIR',
  'REPLACEMENT',
  'UPGRADE',
] as const;

const MODULE_3_ASSET_TYPES = [
  'BRIDGE',
  'OHE',
  'SIGNALLING',
  'STATION',
  'TRACK',
] as const;

/** Module 4 `ResourceType` values. Zero overlap with `MODULE_3_RESOURCE_TYPES`. */
const MODULE_4_RESOURCE_TYPES = [
  'TRACK_MACHINE',
  'MAINTENANCE_CREW',
  'SIGNAL_CREW',
  'OHE_CREW',
  'INSPECTION_TEAM',
  'VEHICLE',
] as const;

// ── Result vocabulary ─────────────────────────────────────────────────────────

export type OptimizerReadinessState = 'READY' | 'PARTIALLY_READY' | 'BLOCKED';

/**
 * Availability of one required Module 3 input.
 *
 * `AVAILABLE`   a legitimate Module 4 source covers it.
 * `PARTIAL`     some elements carry it, others do not.
 * `UNAVAILABLE` no legitimate Module 4 source exists. Must not be filled.
 * `UNRESOLVED`  a mapping decision is required (semantics or enum), not data.
 * `EXCLUDED`    a Module 4 source exists but is explicitly not a valid source.
 */
export type ReadinessStatus =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'UNRESOLVED'
  | 'EXCLUDED';

export interface ReadinessCoverage {
  readonly present: number;
  readonly total: number;
}

export interface OptimizerReadinessInput {
  /** Stable identifier; also the deterministic sort key. */
  readonly id: string;
  /** Dotted Module 3 path this input feeds, e.g. `context.tasks[].corridor_id`. */
  readonly field: string;
  /** Module 3 collection the input belongs to. */
  readonly collection: string;
  /** What Module 3 actually requires. */
  readonly requirement: string;
  readonly status: ReadinessStatus;
  readonly source: OptimizerProvenanceLabel;
  readonly reason: string;
  /** True only for values originating from Module 3's synthetic demo world. */
  readonly synthetic: boolean;
  /** True when supplying the missing data is a user/data-entry action. */
  readonly resolvableByUserAction: boolean;
  /** True when this input alone holds the overall state below READY. */
  readonly blocking: boolean;
  readonly coverage: ReadinessCoverage | null;
}

export interface OptimizerRequestReadiness {
  readonly state: OptimizerReadinessState;
  readonly dataMode: OptimizerDataMode | 'MODULE_4';
  /** Operator-selected corridor scope, when one is selected. */
  readonly scope: {
    readonly corridorId: string | null;
    readonly sectionId: string | null;
    readonly source: OptimizerProvenanceLabel;
  };
  readonly inputs: readonly OptimizerReadinessInput[];
  readonly blocking: readonly OptimizerReadinessInput[];
  readonly warnings: readonly string[];
  /** Echoed unchanged from the registry; this module resolves nothing. */
  readonly unresolvedMappings: readonly UnresolvedMapping[];
  readonly summary: {
    readonly total: number;
    readonly available: number;
    readonly partial: number;
    readonly unavailable: number;
    readonly unresolved: number;
    readonly excluded: number;
    readonly blocking: number;
  };
}

/** The Module 4 data under assessment. Read-only; never mutated. */
export interface Module4ReadinessSnapshot {
  readonly tasks: readonly MaintenanceTask[];
  readonly blockRequests: readonly BlockRequest[];
  readonly assets: readonly Asset[];
  readonly trains: readonly Train[];
  readonly goodsForecasts: readonly GoodsForecast[];
  readonly resources: readonly Resource[];
  readonly corridors: readonly Corridor[];
  readonly integratedBlocks: readonly IntegratedBlock[];
  /**
   * Granted possession records (`@/types/occupancy`). A collection of its own,
   * never `IntegratedBlock` and never derived from `Corridor.availableWindows`.
   * Empty until a possession source system feeds it.
   */
  readonly occupancies: readonly ExistingOccupancy[];
  readonly recommendations: readonly AIRecommendation[];
  readonly scope: PlannerScope;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type Draft = Omit<OptimizerReadinessInput, 'source' | 'synthetic'> &
  Partial<Pick<OptimizerReadinessInput, 'source' | 'synthetic'>>;

const UNAVAILABLE_SOURCE: OptimizerProvenanceLabel = 'UNAVAILABLE_FROM_MODULE_4';
const MAPPED_SOURCE: OptimizerProvenanceLabel = 'MAPPED_FROM_MODULE_4';
const SYNTHETIC_SOURCE: OptimizerProvenanceLabel = 'MODULE_3_SYNTHETIC_DEMO';

/**
 * Completes a draft.
 *
 * Provenance is DERIVED from coverage whenever a coverage figure is present and
 * no source was stated, so that "available" and "came from Module 4" cannot
 * drift apart: a fully covered collection is mapped, anything short of that is
 * unavailable. Deriving it in one place is what keeps a newly measured input
 * from silently reporting a bogus source.
 */
function freeze(draft: Draft): OptimizerReadinessInput {
  const derivedSource: OptimizerProvenanceLabel =
    draft.coverage !== null &&
    draft.coverage.total > 0 &&
    draft.coverage.present === draft.coverage.total
      ? MAPPED_SOURCE
      : UNAVAILABLE_SOURCE;

  return {
    ...draft,
    source: draft.source ?? derivedSource,
    synthetic: draft.synthetic ?? false,
  };
}

function coverageOf<T>(
  items: readonly T[],
  has: (item: T) => boolean,
): ReadinessCoverage {
  let present = 0;
  for (const item of items) {
    if (has(item)) present += 1;
  }
  return { present, total: items.length };
}

function ratio(coverage: ReadinessCoverage): number {
  if (coverage.total === 0) return 1;
  return coverage.present / coverage.total;
}

function statusFor(coverage: ReadinessCoverage): ReadinessStatus {
  if (coverage.total === 0) return 'AVAILABLE';
  const r = ratio(coverage);
  if (r === 1) return 'AVAILABLE';
  return r === 0 ? 'UNAVAILABLE' : 'PARTIAL';
}

function summaryOf(inputs: readonly OptimizerReadinessInput[]) {
  return {
    total: inputs.length,
    available: inputs.filter((i) => i.status === 'AVAILABLE').length,
    partial: inputs.filter((i) => i.status === 'PARTIAL').length,
    unavailable: inputs.filter((i) => i.status === 'UNAVAILABLE').length,
    unresolved: inputs.filter((i) => i.status === 'UNRESOLVED').length,
    excluded: inputs.filter((i) => i.status === 'EXCLUDED').length,
    blocking: inputs.filter((i) => i.blocking && i.status !== 'AVAILABLE').length,
  };
}

/**
 * Pure state machine.
 *
 * BLOCKED         a blocking input is not AVAILABLE.
 * PARTIALLY_READY nothing blocking is missing, but a non-blocking input is.
 * READY            every input is AVAILABLE.
 */
export function deriveReadinessState(
  inputs: readonly OptimizerReadinessInput[],
): OptimizerReadinessState {
  if (inputs.some((i) => i.blocking && i.status !== 'AVAILABLE')) return 'BLOCKED';
  if (inputs.some((i) => i.status !== 'AVAILABLE')) return 'PARTIALLY_READY';
  return 'READY';
}

function assemble(
  dataMode: OptimizerRequestReadiness['dataMode'],
  scope: OptimizerRequestReadiness['scope'],
  drafts: readonly Draft[],
  warnings: readonly string[],
): OptimizerRequestReadiness {
  const inputs = drafts
    .map(freeze)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    state: deriveReadinessState(inputs),
    dataMode,
    scope,
    inputs,
    blocking: inputs.filter((i) => i.blocking && i.status !== 'AVAILABLE'),
    warnings,
    unresolvedMappings: UNRESOLVED_OPTIMIZER_MAPPINGS,
    summary: summaryOf(inputs),
  };
}

function byId(id: string): Draft {
  const found = REQUIRED_INPUT_CATALOGUE.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown readiness input id: ${id}`);
  return { ...found, status: 'UNAVAILABLE', reason: '' };
}

// ── The required-input catalogue ──────────────────────────────────────────────

/**
 * Every required Module 3 input, with the availability a Module 3 synthetic demo
 * world implies. Shared by both assessment paths, so the synthetic and Module 4
 * paths can never drift apart in which inputs they demand.
 */
const REQUIRED_INPUT_CATALOGUE: readonly Draft[] = [
  {
    id: 'assets.asset_type',
    field: 'context.assets[].asset_type',
    collection: 'assets',
    requirement: `Module 3 asset_type (${MODULE_3_ASSET_TYPES.join(' | ')}).`,
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: false,
    coverage: null,
  },
  {
    id: 'assets.corridor_id',
    field: 'context.assets[].corridor_id',
    collection: 'assets',
    requirement: 'Explicit corridor id on every asset.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'block_requests.corridor_id',
    field: 'context.block_requests[].corridor_id',
    collection: 'block_requests',
    requirement: 'Explicit corridor id on every block request.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'corridors.core_fields',
    field:
      'context.corridors[] (corridor_id, origin_station, destination_station)',
    collection: 'corridors',
    requirement: 'Corridor id plus origin and destination station.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'corridors.physical',
    field: 'context.corridors[] (name, gauge, electrified, max_speed_kmph)',
    collection: 'corridors',
    requirement: 'Corridor name, track gauge, electrification and line speed.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: false,
    coverage: null,
  },  {
    id: 'corridors.sections',
    field: 'context.corridors[].sections',
    collection: 'corridors',
    requirement: 'List of sections the corridor spans.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: true,
    coverage: null,
  },
  {
    id: 'existing_blocks.proposed_excluded',
    field: 'context.existing_blocks[]',
    collection: 'existing_blocks',
    requirement: 'Proposed blocks must not be presented as existing occupancy.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: false,
    coverage: null,
  },
  {
    id: 'existing_blocks.approved_source',
    field: 'context.existing_blocks[]',
    collection: 'existing_blocks',
    requirement:
      'Only independently granted possession may appear as an existing block.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: false,
    coverage: null,
  },
  {
    id: 'goods_forecasts.corridor_id',
    field: 'context.goods_forecasts[].corridor_id',
    collection: 'goods_forecasts',
    requirement: 'Explicit corridor id on every goods forecast.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'goods_forecasts.volume_tonnes',
    field: 'context.goods_forecasts[].volume_tonnes',
    collection: 'goods_forecasts',
    requirement: 'Numeric freight volume in tonnes.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'goods_forecasts.window',
    field: 'context.goods_forecasts[].window_start + window_end',
    collection: 'goods_forecasts',
    requirement: 'A start/end time pair bounding the forecast window.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'priorities.priority_score',
    field: 'context.priorities[].priority_score',
    collection: 'priorities',
    requirement: 'Numeric priority score for a recommended task.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: false,
    coverage: null,
  },
  {
    id: 'priorities.recommended_priority',
    field: 'context.priorities[].recommended_priority',
    collection: 'priorities',
    requirement: `Recommended priority level (${MODULE_3_TASK_PRIORITIES.join(' | ')}).`,
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: false,
    coverage: null,
  },
  {
    id: 'priorities.task_id',
    field: 'context.priorities[].task_id',
    collection: 'priorities',
    requirement: 'Single task id the priority applies to.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: false,
    coverage: null,
  },
  {
    id: 'request.corridor_id',
    field: 'request.corridor_id',
    collection: 'request',
    requirement: 'Corridor the optimisation request is scoped to.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'request.occupancy_type',
    field: 'request.occupancy_type',
    collection: 'request',
    requirement: 'Module 3 occupancy type of the requested block.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: true,
    coverage: null,
  },
  {
    id: 'request.task_ids',
    field: 'request.task_ids',
    collection: 'request',
    requirement: 'Tasks the request asks Module 3 to schedule.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'resources.resource_type',
    field: 'context.resources[].resource_type',
    collection: 'resources',
    requirement: `Module 3 resource_type (${MODULE_3_RESOURCE_TYPES.join(' | ')}).`,
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: true,
    coverage: null,
  },
  {
    id: 'tasks.corridor_id',
    field: 'context.tasks[].corridor_id',
    collection: 'tasks',
    requirement: 'Explicit corridor id on every maintenance task.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'corridors.name',
    field: 'context.corridors[].name',
    collection: 'corridors',
    requirement: 'Non-empty corridor name.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'tasks.work_type',
    field: 'context.tasks[].work_type',
    collection: 'tasks',
    requirement: `Module 3 work type (${MODULE_3_WORK_TYPES.join(' | ')}).`,
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'tasks.due_by',
    field: 'context.tasks[].due_by',
    collection: 'tasks',
    requirement: 'Date by which the task must be completed.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    // Module 3 declares due_by with NO default, so it cannot be waived.
    blocking: true,
    coverage: null,
  },
  {
    id: 'tasks.priority',
    field: 'context.tasks[].priority',
    collection: 'tasks',
    requirement: `Explicit Module 3 priority level (${MODULE_3_TASK_PRIORITIES.join(' | ')}).`,
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'tasks.window',
    field: 'context.tasks[].window_start + window_end',
    collection: 'tasks',
    requirement: 'A start/end time pair bounding the requested work window.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'trains.corridor_id',
    field: 'context.train_movements[].corridor_id',
    collection: 'train_movements',
    requirement: 'Explicit corridor id on every train movement.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: true,
    blocking: true,
    coverage: null,
  },
  {
    id: 'trains.movement_id',
    field: 'context.train_movements[].movement_id',
    collection: 'train_movements',
    requirement: 'Movement id identifying the train path.',
    status: 'AVAILABLE',
    reason: '',
    resolvableByUserAction: false,
    blocking: true,
    coverage: null,
  },
];

// ── Synthetic demo path ───────────────────────────────────────────────────────

/**
 * The Module 3 `SYNTHETIC_DEMO` path. Every required Module 3 input is satisfied
 * by Module 3's own deterministic demo world, so the state is READY — with every
 * input labelled `MODULE_3_SYNTHETIC_DEMO` and `synthetic: true`, so a caller can
 * never mistake it for real railway data.
 *
 * This path carries no Module 4 provenance by construction.
 */
export function assessSyntheticDemoReadiness(): OptimizerRequestReadiness {
  const drafts: Draft[] = REQUIRED_INPUT_CATALOGUE.map((template) => ({
    ...template,
    status: 'AVAILABLE',
    source: SYNTHETIC_SOURCE,
    synthetic: true,
    resolvableByUserAction: false,
    reason:
      'Satisfied by Module 3 SYNTHETIC_DEMO data. Not real railway data and not derived from Module 4.',
  }));

  return assemble(
    'SYNTHETIC_DEMO',
    { corridorId: null, sectionId: null, source: SYNTHETIC_SOURCE },
    drafts,
    [
      'READINESS_REFERS_TO_SYNTHETIC_DEMO: these inputs describe Module 3 demo data, not Module 4 railway data.',
    ],
  );
}

// ── Module 4 assessment ───────────────────────────────────────────────────────

/**
 * Assesses whether a legitimate Module 3 request can be built from the given
 * Module 4 data. Pure and synchronous: no network, no mutation, no construction.
 */
export function assessModule4Readiness(
  snapshot: Module4ReadinessSnapshot,
): OptimizerRequestReadiness {
  const topology = buildCorridorTopology(snapshot.corridors);
  const scopeIdentity = plannerScopeIdentity(snapshot.scope, snapshot.corridors);
  const warnings: string[] = [];

  /**
   * Per-entity corridor coverage. The scoped corridor selection is deliberately
   * NOT consulted: selecting a corridor in the planner scopes the request, it
   * does not tell us which corridor each entity belongs to.
   */
  const corridorInput = (
    id: string,
    field: string,
    collection: string,
    items: readonly { corridorId?: string; sectionId?: string }[],
  ): OptimizerReadinessInput => {
    const coverage = coverageOf(items, (item) =>
      resolveCorridorIdentity(item, topology).corridorId !== null,
    );
    const r = ratio(coverage);
    const status: ReadinessStatus =
      coverage.total === 0
        ? 'AVAILABLE'
        : r === 1
          ? 'AVAILABLE'
          : r === 0
            ? 'UNAVAILABLE'
            : 'PARTIAL';
    return freeze({
      id,
      field,
      collection,
      requirement: 'Explicit corridor id on every record.',
      status,
      source: coverage.total > 0 && r === 1 ? MAPPED_SOURCE : UNAVAILABLE_SOURCE,
      reason:
        coverage.total === 0
          ? 'Collection is empty; Module 3 accepts an empty list, so there is nothing to satisfy.'
          : r === 1
            ? `All ${coverage.total} records carry an explicit corridorId.`
            : `${coverage.present}/${coverage.total} records carry an explicit corridorId. sectionId is never parsed into a corridorId, so the remainder cannot be filled.`,
      synthetic: false,
      resolvableByUserAction: true,
      blocking: true,
      coverage,
    });
  };

  const taskCorridors = corridorInput(
    'tasks.corridor_id',
    'context.tasks[].corridor_id',
    'tasks',
    snapshot.tasks,
  );
  const requestCorridors = corridorInput(
    'block_requests.corridor_id',
    'context.block_requests[].corridor_id',
    'block_requests',
    snapshot.blockRequests,
  );
  const assetCorridors = corridorInput(
    'assets.corridor_id',
    'context.assets[].corridor_id',
    'assets',
    snapshot.assets,
  );
  const trainCorridors = corridorInput(
    'trains.corridor_id',
    'context.train_movements[].corridor_id',
    'train_movements',
    snapshot.trains,
  );
  const forecastCorridors = corridorInput(
    'goods_forecasts.corridor_id',
    'context.goods_forecasts[].corridor_id',
    'goods_forecasts',
    snapshot.goodsForecasts,
  );

  const taskWindow = coverageOf(
    snapshot.tasks,
    (t: MaintenanceTask) => Boolean(t.preferredStart) && Boolean(t.preferredEnd),
  );
  const taskPriorities = coverageOf(
    snapshot.tasks,
    (t: MaintenanceTask) => t.priority !== undefined,
  );
  const requestOccupancyTypes = coverageOf(
    snapshot.blockRequests,
    (r) => r.occupancyType !== undefined,
  );
  const taskWorkTypes = coverageOf(
    snapshot.tasks,
    (t: MaintenanceTask) => t.module3WorkType !== undefined,
  );
  const taskDueDates = coverageOf(
    snapshot.tasks,
    (t: MaintenanceTask) => Boolean(t.dueBy),
  );
  const forecastWindows = coverageOf(
    snapshot.goodsForecasts,
    (g: GoodsForecast) => Boolean(g.windowStart) && Boolean(g.windowEnd),
  );
  const forecastVolumes = coverageOf(
    snapshot.goodsForecasts,
    (g: GoodsForecast) =>
      typeof g.volumeTonnes === 'number' && Number.isFinite(g.volumeTonnes),
  );
  const movementIds = coverageOf(
    snapshot.trains,
    (t: Train) => Boolean(t.movementId),
  );
  const corridorSections = coverageOf(
    snapshot.corridors,
    (c: Corridor) => Array.isArray(c.sections) && c.sections.length > 0,
  );
  const corridorNames = coverageOf(
    snapshot.corridors,
    (c: Corridor) => typeof c.name === 'string' && c.name.trim().length > 0,
  );
  const resourceTypes = coverageOf(
    snapshot.resources,
    (r: Resource) => r.module3ResourceType !== undefined,
  );
  const assetTypes = coverageOf(
    snapshot.assets,
    (a: Asset) => (MODULE_3_ASSET_TYPES as readonly string[]).includes(a.assetType),
  );
  const aiSingleTask = coverageOf(
    snapshot.recommendations,
    (r: AIRecommendation) => r.affectedTaskIds.length === 1,
  );
  const aiTaskIds = coverageOf(
    snapshot.recommendations,
    (r: AIRecommendation) => Boolean(r.taskId),
  );
  const aiScores = coverageOf(snapshot.recommendations, (r: AIRecommendation) => {
    return typeof r.priorityScore === 'number' && Number.isFinite(r.priorityScore);
  });
  const aiRecommendedPriorities = coverageOf(
    snapshot.recommendations,
    (r: AIRecommendation) => r.recommendedPriority !== undefined,
  );

  /**
   * Granted possession only. A `PLANNED` occupancy is an intention and a
   * `CANCELLED` one has been withdrawn, so neither constrains a schedule.
   */
  const grantedOccupancies = snapshot.occupancies.filter((o) =>
    (GRANTED_OCCUPANCY_STATUSES as readonly string[]).includes(o.status),
  );
  const completeOccupancies = coverageOf(
    grantedOccupancies,
    (o: ExistingOccupancy) =>
      Boolean(o.occupancyId) &&
      Boolean(o.corridorId) &&
      Boolean(o.section) &&
      Boolean(o.startTime) &&
      Boolean(o.endTime) &&
      Boolean(o.occupancyType) &&
      Array.isArray(o.relatedTaskIds),
  );

  /**
   * Task selection is explicit. An empty selection is reported as empty, never
   * widened to every task, and a selection naming an unknown task is not honoured.
   */
  const knownTaskIds = new Set(snapshot.tasks.map((t) => t.taskId));
  const requestedTaskIds = plannerScopeTaskIds(snapshot.scope);
  const selectedTaskIds = coverageOf(
    requestedTaskIds,
    (taskId: string) => knownTaskIds.has(taskId),
  );

  const proposedBlocks = snapshot.integratedBlocks.filter((b) =>
    ['AI_PROPOSED', 'UNDER_REVIEW'].includes(b.status),
  );
  const approvedBlocks = snapshot.integratedBlocks.filter((b) =>
    ['APPROVED', 'PUBLISHED', 'COMPLETED'].includes(b.status),
  );

  const drafts: Draft[] = [
    // ── Request scope ───────────────────────────────────────────────────────
    {
      ...byId('request.corridor_id'),
      status: scopeIdentity.corridorId ? 'AVAILABLE' : 'UNAVAILABLE',
      source: scopeIdentity.corridorId ? MAPPED_SOURCE : UNAVAILABLE_SOURCE,
      reason: scopeIdentity.corridorId
        ? `Operator selected corridor "${scopeIdentity.corridorId}" in planner scope. This scopes the request only; it does not assign that corridor to any entity.`
        : 'No corridor selected in planner scope. An operator can resolve this by selecting a corridor.',
      resolvableByUserAction: true,
      coverage: null,
    },
    {
      ...byId('request.task_ids'),
      status:
        requestedTaskIds.length === 0 ? 'UNAVAILABLE' : statusFor(selectedTaskIds),
      source:
        selectedTaskIds.total > 0 && ratio(selectedTaskIds) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason:
        requestedTaskIds.length === 0
          ? 'PlannerScope selects no tasks. An empty selection is not widened to every maintenance task: a person chooses what enters a plan.'
          : selectedTaskIds.present === selectedTaskIds.total
            ? `${selectedTaskIds.total} task(s) explicitly selected in planner scope and all of them exist in Module 4.`
            : `${selectedTaskIds.present}/${selectedTaskIds.total} selected task id(s) name no Module 4 task, so they cannot be requested.`,
      resolvableByUserAction: true,
      coverage: selectedTaskIds,
    },
    {
      ...byId('request.occupancy_type'),
      status: statusFor(requestOccupancyTypes),
      source:
        requestOccupancyTypes.total > 0 && ratio(requestOccupancyTypes) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason:
        requestOccupancyTypes.total === 0
          ? 'No block requests in scope.'
          : requestOccupancyTypes.present === 0
            ? `BlockRequest.occupancyType exists in Module 3's own vocabulary (${MODULE_3_OCCUPANCY_TYPES.join(' | ')}) and is populated on ${requestOccupancyTypes.present}/${requestOccupancyTypes.total} block requests. Module 4 blockType (CORRIDOR | SHADOW | EMERGENCY | ROUTINE) is an operational possession class, not a grant type, so it is never mapped; Module 3's TRAFFIC_BLOCK default is never inherited silently either.`
            : `Only ${requestOccupancyTypes.present}/${requestOccupancyTypes.total} block requests carry an explicit occupancy type; blockType is never used as a substitute.`,
      resolvableByUserAction: true,
      coverage: requestOccupancyTypes,
    },

    // ── Tasks ───────────────────────────────────────────────────────────────
    taskCorridors,
    {
      ...byId('tasks.priority'),
      status: statusFor(taskPriorities),
      source:
        taskPriorities.total > 0 && ratio(taskPriorities) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason:
        taskPriorities.total === 0
          ? 'No tasks in scope.'
          : taskPriorities.present === 0
            ? `MaintenanceTask.priority exists in Module 3's own vocabulary (${MODULE_3_TASK_PRIORITIES.join(' | ')}) and is populated on ${taskPriorities.present}/${taskPriorities.total} tasks. It is never computed from criticality, urgency or riskLevel, so the remainder stays unavailable.`
            : `Only ${taskPriorities.present}/${taskPriorities.total} tasks carry an explicit Module 3 priority; the rest have none and none is derived for them.`,
      resolvableByUserAction: true,
      coverage: taskPriorities,
    },
    {
      ...byId('tasks.due_by'),
      status: statusFor(taskDueDates),
      source:
        taskDueDates.total > 0 && ratio(taskDueDates) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason:
        taskDueDates.total === 0
          ? 'No tasks in scope.'
          : taskDueDates.present === 0
            ? `MaintenanceTask.dueBy exists in Module 3's own vocabulary and is populated on ${taskDueDates.present}/${taskDueDates.total} tasks. requestedDate records when work was REQUESTED; Module 3 due_by is a DEADLINE. Same wire type, different meaning, so it is never derived and the remainder stays unavailable.`
            : `Only ${taskDueDates.present}/${taskDueDates.total} tasks carry an explicit due date; requestedDate is never used as a substitute.`,
      resolvableByUserAction: true,
      coverage: taskDueDates,
    },
    {
      ...byId('tasks.work_type'),
      status: statusFor(taskWorkTypes),
      source:
        taskWorkTypes.total > 0 && ratio(taskWorkTypes) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason:
        taskWorkTypes.total === 0
          ? 'No tasks in scope.'
          : taskWorkTypes.present === 0
            ? `MaintenanceTask.module3WorkType exists in Module 3's own vocabulary (${MODULE_3_WORK_TYPES.join(' | ')}) and is populated on ${taskWorkTypes.present}/${taskWorkTypes.total} tasks. Module 3 declares work_type with NO default, so a task without it cannot be sent. The free-text workType is never coerced into it, so the remainder stays unavailable.`
            : `Only ${taskWorkTypes.present}/${taskWorkTypes.total} tasks carry an explicit Module 3 work type; the rest are never coerced from workType.`,
      coverage: taskWorkTypes,
    },
    {
      ...byId('tasks.window'),
      status: statusFor(taskWindow),
      source:
        taskWindow.total > 0 && ratio(taskWindow) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason:
        taskWindow.total === 0
          ? 'No tasks in scope.'
          : `Module 4 preferredStart/preferredEnd present on ${taskWindow.present}/${taskWindow.total} tasks.`,
      resolvableByUserAction: true,
      coverage: taskWindow,
    },

    // ── Block requests ──────────────────────────────────────────────────────
    requestCorridors,

    // ── Trains ──────────────────────────────────────────────────────────────
    {
      ...byId('trains.movement_id'),
      status: statusFor(movementIds),
      reason:
        movementIds.total === 0
          ? 'No trains in scope.'
          : movementIds.present === 0
            ? `Train.movementId is populated on ${movementIds.present}/${movementIds.total} trains. Module 3 also refuses to accept a Module 4 trainId as a movement_id, so a movement identity has to be recorded in its own right.`
            : `Only ${movementIds.present}/${movementIds.total} trains carry a movementId; a trainId is never accepted in its place.`,
      resolvableByUserAction: false,
      coverage: movementIds,
    },
    trainCorridors,

    // ── Goods forecasts ─────────────────────────────────────────────────────
    forecastCorridors,
    {
      ...byId('goods_forecasts.window'),
      status: statusFor(forecastWindows),
      reason:
        forecastWindows.total === 0
          ? 'No goods forecasts in scope.'
          : forecastWindows.present === 0
            ? `GoodsForecast.windowStart/windowEnd is populated on ${forecastWindows.present}/${forecastWindows.total} forecasts. expectedTime is a point estimate and is never widened into a window, so Module 3's window_start and window_end stay unavailable.`
            : `Only ${forecastWindows.present}/${forecastWindows.total} goods forecasts carry a complete windowStart/windowEnd pair; Module 3 requires both window_start and window_end on every forecast.`,
      resolvableByUserAction: true,
      coverage: forecastWindows,
    },
    {
      ...byId('goods_forecasts.volume_tonnes'),
      status: statusFor(forecastVolumes),
      reason:
        forecastVolumes.total === 0
          ? 'No goods forecasts in scope.'
          : forecastVolumes.present === 0
            ? `GoodsForecast.volumeTonnes is populated on ${forecastVolumes.present}/${forecastVolumes.total} forecasts. probability says how likely freight is, not how much, so a tonnage is never inferred from it.`
            : `Only ${forecastVolumes.present}/${forecastVolumes.total} goods forecasts carry a numeric volumeTonnes, while Module 3 requires volume_tonnes on every forecast.`,
      resolvableByUserAction: true,
      coverage: forecastVolumes,
    },

    // ── Assets ──────────────────────────────────────────────────────────────
    assetCorridors,
    {
      ...byId('assets.asset_type'),
      status: statusFor(assetTypes),
      reason: `Module 3 asset_type (${MODULE_3_ASSET_TYPES.join(' | ')}) overlaps Module 4 AssetType on 3 of 10 values; SIGNAL vs SIGNALLING is a naming difference, not a decided mapping.`,
      resolvableByUserAction: false,
      coverage: assetTypes,
    },

    // ── Resources ───────────────────────────────────────────────────────────
    {
      ...byId('resources.resource_type'),
      status: statusFor(resourceTypes) === 'AVAILABLE' ? 'AVAILABLE' : 'UNRESOLVED',
      source:
        resourceTypes.total > 0 && ratio(resourceTypes) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason: `Module 3 resource_type (${MODULE_3_RESOURCE_TYPES.join(' | ')}) and Module 4 ResourceType (${MODULE_4_RESOURCE_TYPES.join(' | ')}) have ZERO overlapping values, so the enum correspondence is undecided and stays unresolved. Resource.module3ResourceType records that decision explicitly and is populated on ${resourceTypes.present}/${resourceTypes.total} resources; resourceType is never coerced.`,
      resolvableByUserAction: false,
      coverage: resourceTypes,
    },

    // ── Corridors ───────────────────────────────────────────────────────────
    {
      ...byId('corridors.core_fields'),
      status: 'AVAILABLE',
      source: MAPPED_SOURCE,
      reason:
        'Module 4 Corridor carries corridorId, fromStation and toStation directly; these are the same three values under Module 3 names (corridor_id, origin_station, destination_station).',
      resolvableByUserAction: true,
      coverage: null,
    },
    {
      ...byId('corridors.name'),
      status: statusFor(corridorNames),
      source:
        corridorNames.total > 0 && ratio(corridorNames) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason: `Module 3 rejects an empty corridor name, and Module 4 has no name field: it identifies a corridor by corridorId and by its fromStation/toStation pair. ${corridorNames.present}/${corridorNames.total} corridors carry an explicit name. A name is never assembled from station names, so the remainder stays unavailable.`,
      resolvableByUserAction: true,
      coverage: corridorNames,
    },
    {
      ...byId('corridors.sections'),
      status: statusFor(corridorSections),
      source:
        corridorSections.total > 0 && ratio(corridorSections) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason: `Corridor.sections lists the full extent of a corridor, which Module 3 requires (its own demo corridors span 2-3 sections) while Module 4 declares a single sectionId. ${corridorSections.present}/${corridorSections.total} corridors carry a list. Topology is never back-filled from sectionId or from a corridor id, so the remainder stays unavailable.`,
      resolvableByUserAction: false,
      coverage: corridorSections,
    },
    {
      ...byId('corridors.physical'),
      status: 'UNAVAILABLE',
      reason:
        'Module 4 Corridor has no name, gauge, electrified or max_speed_kmph, and the Module 3 synthetic corridors carry all four. Reported rather than filled: whether Module 3 tolerates their absence has not been confirmed, so this is not claimed to be blocking.',
      resolvableByUserAction: true,
      coverage: null,
    },

    // ── Existing occupancy ──────────────────────────────────────────────────
    {
      ...byId('existing_blocks.approved_source'),
      status: statusFor(completeOccupancies),
      source:
        completeOccupancies.total > 0 && ratio(completeOccupancies) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason:
        snapshot.occupancies.length === 0
          ? 'Module 4 has an ExistingOccupancy contract for granted possession, but no possession source feeds it, so there is nothing to send. Corridor.availableWindows is not a substitute: it states capacity and carries no occupancy type and no related task ids. Module 3 accepts an empty existing_blocks list, so this does not block on its own.'
          : grantedOccupancies.length === 0
            ? `None of the ${snapshot.occupancies.length} occupancy record(s) is granted: possession counts only when its status is ${GRANTED_OCCUPANCY_STATUSES.join(' or ')}. A planned or cancelled record does not constrain a schedule.`
            : completeOccupancies.present === completeOccupancies.total
              ? `${completeOccupancies.total} granted possession record(s) carry every field Module 3 ExistingBlock requires.`
              : `Only ${completeOccupancies.present}/${completeOccupancies.total} granted possession record(s) are complete.`,
      resolvableByUserAction: false,
      coverage: completeOccupancies,
    },
    {
      id: 'existing_blocks.proposed_excluded',
      field: 'context.existing_blocks[]',
      collection: 'existing_blocks',
      requirement: 'Proposed blocks must not be presented as existing occupancy.',
      status: 'EXCLUDED',
      source: UNAVAILABLE_SOURCE,
      reason: `${proposedBlocks.length} proposed IntegratedBlock(s) (${proposedBlocks
        .map((b) => `${b.blockId}:${b.status}`)
        .join(', ') || 'none'}) and ${approvedBlocks.length} approved/published block(s) exist in Module 4. None may be used as Module 3 existing_blocks: an IntegratedBlock is a planning artefact rather than an independently granted possession, and it carries no Module 3 occupancy_type. IntegratedBlock and ExistingOccupancy are separate types for this reason.`,
      synthetic: false,
      resolvableByUserAction: false,
      blocking: false,
      coverage: null,
    },

    // ── AI priority ─────────────────────────────────────────────────────────
    {
      ...byId('priorities.task_id'),
      status: statusFor(aiTaskIds),
      source:
        aiTaskIds.total > 0 && ratio(aiTaskIds) === 1 ? MAPPED_SOURCE : UNAVAILABLE_SOURCE,
      reason: `AIRecommendation.taskId records the single task a Module 3 priority belongs to and is populated on ${aiTaskIds.present}/${aiTaskIds.total} recommendations. affectedTaskIds is a list and is not collapsed into a scalar: ${aiSingleTask.present}/${aiSingleTask.total} recommendations name exactly one task, but a one-element list does not assert that a taskId was recorded.`,
      resolvableByUserAction: false,
      coverage: aiTaskIds,
    },
    {
      ...byId('priorities.priority_score'),
      status: statusFor(aiScores),
      source:
        aiScores.total > 0 && ratio(aiScores) === 1 ? MAPPED_SOURCE : UNAVAILABLE_SOURCE,
      reason:
        aiScores.total === 0
          ? 'Module 4 exposes no AI recommendations, so there is no priority source to assess.'
          : aiScores.present === 0
            ? `AIRecommendation.priorityScore is populated on ${aiScores.present}/${aiScores.total} recommendations. Module 3 priority_score is a number on its own scale; it is never taken from RecommendationStatus, confidence or operationalImpact.`
            : `Only ${aiScores.present}/${aiScores.total} AI recommendations carry a numeric priorityScore, while Module 3 requires priority_score on every priority record.`,
      resolvableByUserAction: false,
      coverage: aiScores,
    },
    {
      ...byId('priorities.recommended_priority'),
      status: statusFor(aiRecommendedPriorities),
      source:
        aiRecommendedPriorities.total > 0 && ratio(aiRecommendedPriorities) === 1
          ? MAPPED_SOURCE
          : UNAVAILABLE_SOURCE,
      reason: `AIRecommendation.recommendedPriority carries Module 3's priority vocabulary (${MODULE_3_TASK_PRIORITIES.join(' | ')}) explicitly and is populated on ${aiRecommendedPriorities.present}/${aiRecommendedPriorities.total} recommendations. It is never derived from criticality, urgency or risk.`,
      resolvableByUserAction: false,
      coverage: aiRecommendedPriorities,
    },
  ];

  if (scopeIdentity.corridorId) {
    warnings.push(
      'PLANNER_SCOPE_CORRIDOR_DOES_NOT_ASSIGN_ENTITIES: the selected corridor scopes the request only. It was not applied to any task, block request, asset, train or forecast.',
    );
  }
  if (proposedBlocks.length > 0) {
    warnings.push(
      'PROPOSED_BLOCKS_NOT_TREATED_AS_EXISTING_OCCUPANCY: proposed IntegratedBlocks remain proposals.',
    );
  }
  if (snapshot.tasks.length === 0) {
    warnings.push('NO_TASKS_IN_SCOPE: Module 4 has no maintenance tasks to optimise.');
  }

  return assemble(
    'MODULE_4',
    {
      corridorId: scopeIdentity.corridorId,
      sectionId: scopeIdentity.sectionId,
      source: scopeIdentity.source,
    },
    drafts,
    warnings,
  );
}
