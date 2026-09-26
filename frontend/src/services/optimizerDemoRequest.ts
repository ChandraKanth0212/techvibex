/**
 * RailOpt Module 4 - synthetic-demo request provider for the Module 3 optimizer.
 *
 * Phase 9B-1 scope: this provider exists ONLY to let Module 4 exercise
 * `POST /api/optimizer/generate` while the real Module 4 -> Module 3 mapping is
 * still blocked. It is the interim path, not the destination.
 *
 * WHY A VENDORED FIXTURE INSTEAD OF A BUILDER
 * --------------------------------------------
 * The Phase 9B audit established that a Module 4 -> Module 3 context CANNOT be
 * built honestly today. The single hardest blocker is `corridor_id`: Module 3
 * requires it on `MaintenanceTask`, `BlockRequest`, `Asset`, `TrainMovement`,
 * `ExistingBlock` and `GoodsForecast`, while Module 4 has no `corridorId` field
 * anywhere in its domain model (it models a single `sectionId`). Deriving it by
 * splitting a section id is forbidden, because that is inference over an
 * undocumented naming convention rather than a mapping.
 *
 * Four more collections are blocked for the same class of reason: Module 3
 * requires `TrainMovement.movement_id` (and its own adapter explicitly refuses
 * to accept a Module 1 train id as one), requires a `window_start`/`window_end`
 * time pair plus `volume_tonnes` on `GoodsForecast` (Module 4 has only a single
 * `expectedTime`), requires `Corridor.name` (Module 4 has none), and Module 4's
 * `ResourceType` vocabulary has ZERO overlap with Module 3's.
 *
 * Module 3 ships its own deterministic SYNTHETIC_DEMO world, and its own builder
 * for exactly this request. So rather than reconstructing 500+ railway records
 * field-by-field in Module 4 - which is precisely the fabrication this phase
 * forbids - the payload below is Module 3's output, vendored verbatim.
 *
 * GUARANTEES
 * ----------
 *   - The fixture is the EXACT body `POST /api/optimizer/generate` accepts. It was
 *     serialized by Module 3 itself and re-validated against Module 3's Pydantic
 *     `OptimizeRequest`, with referential integrity asserted (every task resolves
 *     to a real corridor, asset and resource).
 *   - `SYNTHETIC_DEMO_FIXTURE_SHA256` pins the payload so an accidental edit is
 *     detectable in tests rather than silently changing what Module 3 receives.
 *   - Nothing here invents, derives, normalises or coerces a single value. The
 *     fixture is the payload.
 *   - Provenance is exposed so the UI can label every field's origin instead of
 *     presenting synthetic records as real railway data.
 *
 * NOT DONE HERE, ON PURPOSE
 * -------------------------
 * None of the Phase 9B unresolved semantic mappings are performed. `block_type`
 * is not mapped to a Module 4 `BlockType`, `objective_value` is not an
 * efficiency score, `criticality`/`urgency`/`risk` are not collapsed into a
 * Module 3 `priority`, `confidence` is not a UI score, violation severity is not
 * widened into a `ConflictSeverity`, and `requestedDate` is not treated as
 * `due_by`. See `UNRESOLVED_OPTIMIZER_MAPPINGS` in `@/types/optimizer`.
 */

import syntheticDemoPayload from './__fixtures__/module3SyntheticDemo.json';
import type { OptimizeRequestDTO, OptimizerContextDTO } from '@/types/optimizer';

/** Module 3 `data_mode` for this integration. */
export const SYNTHETIC_DEMO_DATA_MODE = 'SYNTHETIC_DEMO';

/** Module 3 `storage` for this integration. Plans do not survive a Module 3 restart. */
export const SYNTHETIC_DEMO_STORAGE = 'IN_MEMORY';

/** Seed Module 3's own demo builder was called with. */
export const SYNTHETIC_DEMO_SEED = 0;

/**
 * sha256 over the raw bytes of `__fixtures__/module3SyntheticDemo.json`.
 *
 * The file is byte-for-byte what Module 3's own demo builder emitted, so this
 * pins the vendored payload: if the fixture is edited, reformatted or partially
 * regenerated, the digest stops matching and the test fails. Hashing the file
 * bytes (rather than a re-serialised object) keeps the check independent of
 * language-specific number formatting - Python writes `800.0` where JavaScript
 * writes `800` for the same value.
 */
export const SYNTHETIC_DEMO_FIXTURE_SHA256 =
  '6aef899245f1fd7fc0787dc73a431a0e887e1cc97a91d1082851c30e6d9e8e3e';

/** Where the fixture came from, for the UI and for anyone auditing the payload. */
export const SYNTHETIC_DEMO_SOURCE = 'optimizer/demo_data/datasets.py::demo_generate_payload(seed=0)';

/**
 * How a single value in the outgoing payload came to exist.
 *
 * The UI must be able to tell these apart. Presenting a synthetic record or a
 * Module 3 default as real railway data is the failure mode this phase exists to
 * prevent.
 */
export type OptimizerProvenanceLabel =
  /** Taken from a real Module 4 field with an agreed mapping. */
  | 'MAPPED_FROM_MODULE_4'
  /** Not supplied by Module 4; Module 3's own default applies. */
  | 'MODULE_3_DEFAULT'
  /** Module 3's deterministic SYNTHETIC_DEMO data, used verbatim. */
  | 'MODULE_3_SYNTHETIC_DEMO'
  /** No legitimate Module 4 source exists; the field is absent by design. */
  | 'UNAVAILABLE_FROM_MODULE_4';

export interface OptimizerProvenanceEntry {
  /** Dotted path into the outgoing payload, e.g. `context.tasks`. */
  readonly field: string;
  readonly label: OptimizerProvenanceLabel;
  /** Element count for a collection, when the payload actually carries one. */
  readonly count: number | null;
  readonly reason: string;
}

export interface OptimizerRequestProvenance {
  readonly dataMode: typeof SYNTHETIC_DEMO_DATA_MODE;
  readonly storage: typeof SYNTHETIC_DEMO_STORAGE;
  readonly source: string;
  readonly seed: number;
  readonly fixtureSha256: string;
  /** The single-task scope the request actually asks Module 3 to optimise. */
  readonly scope: {
    readonly requestId: string;
    readonly taskIds: readonly string[];
    readonly corridorId: string;
    readonly section: string;
  };
  readonly horizon: { readonly start: string; readonly end: string };
  /** True only when some value genuinely came from a Module 4 field. */
  readonly containsModule4Data: false;
  readonly entries: readonly OptimizerProvenanceEntry[];
  readonly warnings: readonly string[];
}

/**
 * Fields the Phase 9B audit found with NO legitimate Module 4 source.
 *
 * These are recorded rather than filled. Each one is a real gap in the Module 4
 * domain model, not an oversight in this provider, and none of them may be
 * papered over with a placeholder value: Module 3 rejects empty strings and
 * missing keys alike, so a `""` filler would fail validation just the same while
 * looking like it worked.
 */
export const UNAVAILABLE_MODULE4_FIELDS: readonly OptimizerProvenanceEntry[] = [
  {
    field: 'request.corridor_id',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason:
      'Module 3 requires corridor_id on BlockRequest; Module 4 models only sectionId. Deriving corridorId from sectionId is forbidden. Value below is Module 3 synthetic demo data.',
  },
  {
    field: 'context.tasks[].corridor_id',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'Module 4 MaintenanceTask has no corridorId field at all.',
  },
  {
    field: 'context.assets[].corridor_id',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'Module 4 Asset has sectionId but no corridorId.',
  },
  {
    field: 'context.train_movements[].corridor_id',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'Module 4 Train has sectionId but no corridorId.',
  },
  {
    field: 'context.existing_blocks[].corridor_id',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'Module 4 IntegratedBlock has sectionId but no corridorId.',
  },
  {
    field: 'context.goods_forecasts[].corridor_id',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'Module 4 GoodsForecast has sectionId but no corridorId.',
  },
  {
    field: 'context.train_movements[].movement_id',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason:
      'Module 4 has trainId/trainNumber but no movement id, and the Module 3 adapter explicitly refuses a Module 1 train id as a substitute.',
  },
  {
    field: 'context.goods_forecasts[].window_start',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason:
      'Module 3 requires a time-of-day window; Module 4 GoodsForecast carries only expectedTime. Module 3 forbids deriving the date from a route timestamp.',
  },
  {
    field: 'context.goods_forecasts[].window_end',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'No Module 4 source; a window cannot be invented from a single instant.',
  },
  {
    field: 'context.goods_forecasts[].volume_tonnes',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'Module 4 GoodsForecast has no tonnage field.',
  },
  {
    field: 'context.corridors[].name',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'Module 3 requires a non-empty corridor name; Module 4 Corridor has none.',
  },
  {
    field: 'context.corridors[].gauge',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'No Module 4 source; Module 3 gauge would be a default, not data.',
  },
  {
    field: 'context.corridors[].electrified',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'No Module 4 source; Module 3 would default to true.',
  },
  {
    field: 'context.corridors[].max_speed_kmph',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason: 'No Module 4 source; Module 3 would default to 130.0.',
  },
  {
    field: 'context.assets[].condition_score',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason:
      'Module 3 wants a 0-1 number; Module 4 Asset.condition is GOOD/FAIR/POOR/CRITICAL, a different axis with no agreed conversion.',
  },
  {
    field: 'context.existing_blocks',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason:
      'Module 4 IntegratedBlock is a PROPOSED block (MANUAL/OPTIMIZER_GENERATED/AI_RECOMMENDED), not an already-approved occupancy. Mapping it to ExistingBlock would tell Module 3 its own proposals are pre-existing constraints.',
  },
  {
    field: 'context.priorities',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason:
      'Module 3 requires a per-task priority_score (0-100) and recommended_priority; Module 4 AIRecommendation has neither (only affectedTaskIds[]).',
  },
  {
    field: 'context.resources[].resource_type',
    label: 'UNAVAILABLE_FROM_MODULE_4',
    count: null,
    reason:
      'Zero vocabulary overlap: Module 3 uses POSSESSION/ENGINEERING_TRAIN/MACHINERY/MANPOWER/MATERIAL, Module 4 uses TRACK_MACHINE/MAINTENANCE_CREW/SIGNAL_CREW/OHE_CREW/INSPECTION_TEAM/VEHICLE.',
  },
];

/**
 * Module 3 defaults that apply because Module 4 supplied nothing.
 *
 * These are legitimate - they are Module 3's own documented defaults, not
 * invented values - but the UI must still be able to distinguish them from data.
 */
export const MODULE_3_DEFAULT_FIELDS: readonly OptimizerProvenanceEntry[] = [
  {
    field: 'request.occupancy_type',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason:
      "Module 3 defaults to TRAFFIC_BLOCK. Module 4 BlockType (CORRIDOR/SHADOW/EMERGENCY/ROUTINE) is an operational possession class and must NOT be mapped onto OccupancyType.",
  },
  {
    field: 'context.tasks[].priority',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason:
      'Module 3 defaults to MEDIUM. Module 4 criticality/urgency/risk are NOT converted: CRITICAL and URGENT are different axes and the conversion is forbidden.',
  },
  {
    field: 'context.tasks[].required_track_slots',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason: 'Module 3 defaults to 1; Module 4 has no track-slot concept.',
  },
  {
    field: 'context.defects[].detected_by',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason: "Module 3 defaults to 'system'; Module 4 Defect has no detector field.",
  },
  {
    field: 'context.defects[].recommended_window_days',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason: 'Module 3 defaults to 7; Module 4 has no equivalent.',
  },
  {
    field: 'context.train_movements[].direction',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason: "Module 3 defaults to 'BOTH'; Module 4 DirectionType has no BOTH value.",
  },
  {
    field: 'context.train_movements[].frequency',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason: "Module 3 defaults to 'DAILY'; Module 4 has no frequency field.",
  },
  {
    field: 'context.existing_blocks[].status',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason: "Module 3 defaults to 'PLANNED'; Module 4 statuses only partly overlap.",
  },
  {
    field: 'settings',
    label: 'MODULE_3_DEFAULT',
    count: null,
    reason:
      'Every setting is explicitly null, so Module 3 applies its own configured defaults. Nothing is overridden.',
  },
];

const FIXTURE = syntheticDemoPayload as unknown as OptimizeRequestDTO;

function contextCollection(context: OptimizerContextDTO, key: keyof OptimizerContextDTO): unknown[] {
  const value = context[key];
  return Array.isArray(value) ? value : [];
}

/**
 * Phase 9A types the `BlockRequest` payload as an opaque
 * `Record<string, unknown>` on purpose, so these readers narrow rather than
 * cast. Nothing is coerced: a non-string is reported as absent instead of being
 * stringified, and the fixture is asserted to carry all of them.
 */
function readString(source: Record<string, unknown> | null | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === 'string' ? value : '';
}

function readStringArray(source: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Provenance for the synthetic-demo payload.
 *
 * Every value in the outgoing body is Module 3 synthetic demo data, so
 * `containsModule4Data` is a literal `false`: the UI must not present any of it
 * as real railway data.
 */
export function describeSyntheticDemoProvenance(): OptimizerRequestProvenance {
  const context = FIXTURE.context ?? {};
  const request = FIXTURE.request ?? null;

  const collectionEntries: OptimizerProvenanceEntry[] = (
    [
      'tasks',
      'block_requests',
      'corridors',
      'assets',
      'defects',
      'resources',
      'train_movements',
      'goods_forecasts',
      'existing_blocks',
      'priorities',
    ] as const
  ).map((key) => ({
    field: `context.${key}`,
    label: 'MODULE_3_SYNTHETIC_DEMO' as const,
    count: contextCollection(context, key).length,
    reason: 'Module 3 deterministic SYNTHETIC_DEMO world, vendored verbatim.',
  }));

  return {
    dataMode: SYNTHETIC_DEMO_DATA_MODE,
    storage: SYNTHETIC_DEMO_STORAGE,
    source: SYNTHETIC_DEMO_SOURCE,
    seed: SYNTHETIC_DEMO_SEED,
    fixtureSha256: SYNTHETIC_DEMO_FIXTURE_SHA256,
    scope: {
      requestId: readString(request, 'request_id'),
      taskIds: readStringArray(request, 'task_ids'),
      corridorId: readString(request, 'corridor_id'),
      section: readString(request, 'section'),
    },
    horizon: {
      start: context.horizon_start ?? '',
      end: context.horizon_end ?? '',
    },
    containsModule4Data: false,
    entries: [
      ...collectionEntries,
      ...UNAVAILABLE_MODULE4_FIELDS,
      ...MODULE_3_DEFAULT_FIELDS,
    ],
    warnings: [
      'This plan is SYNTHETIC_DEMO data produced by Module 3. It is not real railway data and must not be presented as such.',
      'No value in this payload originates from a Module 4 field; the Module 4 -> Module 3 mapping is not implemented yet.',
      `Plans are stored ${SYNTHETIC_DEMO_STORAGE} in Module 3 and do not survive a Module 3 restart.`,
    ],
  };
}

/**
 * The exact body for `POST /api/optimizer/generate`.
 *
 * A fresh deep copy is returned on every call so a caller cannot mutate the
 * vendored fixture, and repeated calls are byte-identical.
 */
export function buildSyntheticDemoOptimizeRequest(): OptimizeRequestDTO {
  return JSON.parse(JSON.stringify(FIXTURE)) as OptimizeRequestDTO;
}

/** Read-only view of the fixture, for assertions and for size/shape introspection. */
export function readSyntheticDemoFixture(): OptimizeRequestDTO {
  return FIXTURE;
}
