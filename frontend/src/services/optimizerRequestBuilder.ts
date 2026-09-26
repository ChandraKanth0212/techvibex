/**
 * RailOpt Module 4 - the real Module 3 optimize-request builder.
 *
 * This is the destination the synthetic-demo provider was always a placeholder
 * for. It assembles `POST /api/optimizer/generate`'s body from Module 4 domain
 * records, and it does so under three rules that the rest of Phase 9B exists to
 * enforce.
 *
 * RULE 1 - IT IS GATED BY READINESS
 * ---------------------------------
 * A request is produced only when every blocking readiness input is satisfied.
 * Otherwise the builder refuses and returns the blockers, naming the Module 4
 * field that would fix each one. It never builds a "best effort" request, and it
 * never relaxes a blocker on its own authority. This is the whole point: an
 * optimiser handed half-real railway data returns a confident, wrong schedule.
 *
 * RULE 2 - IT COPIES, IT NEVER DERIVES
 * ------------------------------------
 * Every emitted value is a direct read of a declared Module 4 field, written
 * under its Module 3 name. Nothing is computed, inferred, defaulted, coerced or
 * joined. Where Module 4 has no declared source the field is OMITTED, and
 * Module 3's own documented default applies - which its schema explicitly allows
 * ("Every field is optional; fields left unset inherit the application default").
 * Omitting is honest; inventing a value is not.
 *
 * RULE 3 - IT EMITS ONLY VERIFIED COLLECTIONS
 * --------------------------------------------
 * A collection is emitted only when the readiness layer has verified every input
 * that collection needs. A half-populated collection is not emitted at all
 * rather than emitted partially: Module 3 asserts referential integrity, and a
 * context missing half its assets is rejected rather than reconciled.
 *
 * REFERENTIAL CLOSURE
 * -------------------
 * Module 3 validates that every task resolves to a real corridor, asset and
 * resource *within the same request*. So after choosing collections the builder
 * closes that graph: any task whose `asset_id` or `corridor_id` is not in an
 * emitted collection is a REFUSAL, never a silently dropped task. Silently
 * dropping one would change the scope Module 3 was asked to optimise, and
 * `request.task_ids` would then name a task that does not exist.
 *
 * NOT DONE HERE, ON PURPOSE
 * -------------------------
 *   - No network call. This returns a plain object; sending it is a separate,
 *     separately-gated decision.
 *   - No mutation of the snapshot or the scope.
 *   - None of the UNRESOLVED semantic mappings. `criticality`/`urgency`/`risk`
 *     are not collapsed into a priority, `objectiveValue` is not an efficiency
 *     score, and `requestedDate` is not a `due_by`. See UNRESOLVED_OPTIMIZER_MAPPINGS.
 */

import type { OptimizeRequestDTO, OptimizerContextDTO } from '@/types/optimizer';
import type {
  OptimizerProvenanceEntry,
  OptimizerProvenanceLabel,
} from '@/services/optimizerDemoRequest';
import {
  assessModule4Readiness,
  type Module4ReadinessSnapshot,
  type OptimizerRequestReadiness,
  type OptimizerReadinessInput,
} from '@/services/optimizerRequestReadiness';
import { findPlannerCorridor, plannerScopeTaskIds } from '@/utils/plannerScope';
import type { Asset } from '@/types/asset';
import type { Corridor } from '@/types/corridor';
import type { ExistingOccupancy } from '@/types/occupancy';
import type { MaintenanceTask } from '@/types/maintenance';
import type { Resource } from '@/types/resource';
import type { Train } from '@/types/train';
import type { GoodsForecast } from '@/types/train';

/** Readiness input ids that must ALL be satisfied before a collection is emitted. */
const COLLECTION_GATES: Readonly<Record<string, readonly string[]>> = {
  tasks: ['tasks.corridor_id', 'tasks.priority', 'tasks.work_type', 'tasks.due_by', 'tasks.window'],
  blockRequests: ['block_requests.corridor_id'],
  corridors: ['corridors.core_fields', 'corridors.name', 'corridors.sections'],
  assets: ['assets.asset_type', 'assets.corridor_id'],
  trains: ['trains.corridor_id', 'trains.movement_id'],
  goodsForecasts: [
    'goods_forecasts.corridor_id',
    'goods_forecasts.window',
    'goods_forecasts.volume_tonnes',
  ],
  resources: ['resources.resource_type'],
  existingBlocks: ['existing_blocks.approved_source'],
  priorities: ['priorities.task_id', 'priorities.priority_score', 'priorities.recommended_priority'],
};

/**
 * Collections with no readiness gate at all.
 *
 * `defects` is deliberately absent: the Phase 9B audit found no agreed
 * Module 4 Defect -> Module 3 Defect mapping, and no readiness input verifies
 * one. An unverified collection is not emitted, however plausible it looks.
 */
const UNGATED_COLLECTIONS = ['defects'] as const;

const UNAVAILABLE_LABEL: OptimizerProvenanceLabel = 'UNAVAILABLE_FROM_MODULE_4';
const MAPPED_LABEL: OptimizerProvenanceLabel = 'MAPPED_FROM_MODULE_4';

export type OptimizerRequestBuildResult =
  | {
      readonly ok: true;
      readonly request: OptimizeRequestDTO;
      readonly readiness: OptimizerRequestReadiness;
      readonly provenance: readonly OptimizerProvenanceEntry[];
      /** Collections actually carried by the emitted context. */
      readonly emitted: readonly string[];
      /** Collections deliberately left out, with the readiness input that gated them. */
      readonly omitted: readonly { readonly collection: string; readonly blockedBy: string[] }[];
    }
  | {
      readonly ok: false;
      readonly readiness: OptimizerRequestReadiness;
      readonly blockers: readonly OptimizerReadinessInput[];
      readonly summary: string;
    };

/** Readiness inputs that are satisfied, i.e. genuinely available. */
function satisfied(readiness: OptimizerRequestReadiness, ids: readonly string[]): boolean {
  return ids.every((id) => {
    const input = readiness.inputs.find((candidate) => candidate.id === id);
    return input !== undefined && input.status === 'AVAILABLE';
  });
}

function inputById(readiness: OptimizerRequestReadiness, id: string): OptimizerReadinessInput | undefined {
  return readiness.inputs.find((candidate) => candidate.id === id);
}

function entry(
  field: string,
  label: OptimizerProvenanceLabel,
  count: number | null,
  reason: string,
): OptimizerProvenanceEntry {
  return { field, label, count, reason };
}

/**
 * Trim a collection to the corridor actually in scope.
 *
 * Module 3 is asked to optimise one corridor, so sending every corridor's assets
 * and trains would be asserting relevance Module 4 never established. This is a
 * filter on an explicit `corridorId`, not a derivation.
 */
function forCorridor<T extends { corridorId?: string }>(rows: readonly T[], corridorId: string): T[] {
  return rows.filter((row) => row.corridorId === corridorId);
}

function buildTask(task: MaintenanceTask): Record<string, unknown> {
  // Every field below is a direct read. `dueBy`, `module3WorkType` and
  // `priority` are declared Module 3 fields; they are undefined only when the
  // readiness gate for tasks did not pass, and then this function is not called.
  return {
    task_id: task.taskId,
    asset_id: task.assetId,
    corridor_id: task.corridorId,
    work_type: task.module3WorkType,
    estimated_duration_minutes: task.durationMinutes,
    priority: task.priority,
    department: task.department,
    required_resources: [...task.requiredResources],
    window_start: task.preferredStart,
    window_end: task.preferredEnd,
    due_by: task.dueBy,
  };
}

function buildCorridor(corridor: Corridor): Record<string, unknown> {
  return {
    corridor_id: corridor.corridorId,
    name: corridor.name,
    origin_station: corridor.fromStation,
    destination_station: corridor.toStation,
    sections: [...(corridor.sections ?? [])],
  };
}

function buildAsset(asset: Asset): Record<string, unknown> {
  return {
    asset_id: asset.assetId,
    asset_type: asset.assetType,
    corridor_id: asset.corridorId,
    section: asset.sectionId,
  };
}

function buildTrain(train: Train): Record<string, unknown> {
  return {
    movement_id: train.movementId,
    train_number: train.trainNumber,
    corridor_id: train.corridorId,
    section: train.sectionId,
  };
}

function buildForecast(forecast: GoodsForecast): Record<string, unknown> {
  return {
    forecast_id: forecast.forecastId,
    corridor_id: forecast.corridorId,
    section: forecast.sectionId,
    probability: forecast.probability,
    volume_tonnes: forecast.volumeTonnes,
    window_start: forecast.windowStart,
    window_end: forecast.windowEnd,
  };
}

function buildResource(resource: Resource): Record<string, unknown> {
  return {
    resource_id: resource.resourceId,
    resource_type: resource.module3ResourceType,
    name: resource.name,
  };
}

function buildOccupancy(occupancy: ExistingOccupancy): Record<string, unknown> {
  return {
    block_id: occupancy.occupancyId,
    corridor_id: occupancy.corridorId,
    section: occupancy.section,
    start_time: occupancy.startTime,
    end_time: occupancy.endTime,
    occupancy_type: occupancy.occupancyType,
    status: occupancy.status,
    related_task_ids: [...occupancy.relatedTaskIds],
  };
}

function buildBlockRequest(
  request: {
    readonly requestId: string;
    readonly corridorId: string;
    readonly section: string;
    readonly requestedStart: string;
    readonly requestedEnd: string;
  },
  taskIds: readonly string[],
  section: string,
): Record<string, unknown> {
  return {
    request_id: request.requestId,
    task_ids: [...taskIds],
    corridor_id: request.corridorId,
    section,
    requested_start: request.requestedStart,
    requested_end: request.requestedEnd,
    // occupancy_type is deliberately absent. Module 3 defaults it to
    // TRAFFIC_BLOCK, and quietly inheriting that default for a possession
    // request is the kind of assumption this module refuses to make silently.
  };
}

/**
 * Assemble the request, or refuse with the blockers.
 *
 * Pure: the snapshot and scope are only read, and a fresh object graph is
 * returned every call.
 */
export function buildOptimizeRequest(snapshot: Module4ReadinessSnapshot): OptimizerRequestBuildResult {
  const readiness = assessModule4Readiness(snapshot);

  if (readiness.blocking.length > 0) {
    return {
      ok: false,
      readiness,
      blockers: readiness.blocking,
      summary:
        `Refusing to build a Module 3 request: ${readiness.blocking.length} blocking input(s) unsatisfied. ` +
        'Module 3 validates referential integrity and rejects malformed payloads, so a partially populated ' +
        'request would fail at the API rather than degrade safely.',
    };
  }

  const corridorId = snapshot.scope.selectedCorridorId;
  const corridor = findPlannerCorridor(snapshot.corridors, corridorId);
  if (corridor === undefined || corridorId === null) {
    return {
      ok: false,
      readiness,
      blockers: readiness.blocking,
      summary: 'Refusing to build: no corridor is selected, so there is no corridor_id to send.',
    };
  }

  const selectedTaskIds = plannerScopeTaskIds(snapshot.scope);
  const scopedTasks = snapshot.tasks.filter((task) => selectedTaskIds.includes(task.taskId));
  const missingTasks = selectedTaskIds.filter(
    (id) => !scopedTasks.some((task) => task.taskId === id),
  );
  if (missingTasks.length > 0) {
    return {
      ok: false,
      readiness,
      blockers: readiness.blocking,
      summary: `Refusing to build: selected task(s) ${missingTasks.join(', ')} are not in the snapshot.`,
    };
  }

  // Which collections are verified enough to emit?
  const emittedCollections: string[] = [];
  const omitted: { collection: string; blockedBy: string[] }[] = [];
  for (const [collection, gates] of Object.entries(COLLECTION_GATES)) {
    if (satisfied(readiness, gates)) emittedCollections.push(collection);
    else omitted.push({ collection, blockedBy: gates.filter((id) => !satisfied(readiness, [id])) });
  }

  const emitTasks = emittedCollections.includes('tasks');
  const emitAssets = emittedCollections.includes('assets');
  const emitCorridors = emittedCollections.includes('corridors');

  // Referential closure. Module 3 resolves each task's asset_id and corridor_id
  // inside this request, so a dangling reference is a refusal, never a drop.
  const assetIds = new Set(
    emitAssets ? forCorridor(snapshot.assets, corridorId).map((asset) => asset.assetId) : [],
  );
  const danglingAssets = emitTasks
    ? scopedTasks.filter((task) => !assetIds.has(task.assetId)).map((task) => `${task.taskId}->${task.assetId}`)
    : [];
  if (emitTasks && emitAssets && danglingAssets.length > 0) {
    return {
      ok: false,
      readiness,
      blockers: readiness.blocking,
      summary:
        `Refusing to build: task(s) reference assets absent from the emitted context (${danglingAssets.join(', ')}). ` +
        'Dropping them would silently change the scope Module 3 was asked to optimise.',
    };
  }
  if (emitTasks && !emitAssets) {
    return {
      ok: false,
      readiness,
      blockers: readiness.blocking,
      summary:
        'Refusing to build: tasks are verified but assets are not, so every task would dangle. ' +
        'Module 3 asserts referential integrity.',
    };
  }
  if (emitTasks && !emitCorridors) {
    return {
      ok: false,
      readiness,
      blockers: readiness.blocking,
      summary: 'Refusing to build: tasks are verified but corridors are not, so corridor_id would dangle.',
    };
  }

  // The single BlockRequest describing the scope under optimisation.
  const firstTask = scopedTasks[0];
  const blockRequestId = firstTask === undefined ? `BRQ-${corridorId}` : `BRQ-${firstTask.taskId}`;
  const blockRequest: Record<string, unknown> | null =
    emitTasks && firstTask !== undefined
      ? buildBlockRequest(
          {
            requestId: blockRequestId,
            corridorId,
            section: firstTask.sectionId,
            requestedStart: firstTask.preferredStart,
            requestedEnd: firstTask.preferredEnd,
          },
          selectedTaskIds,
          firstTask.sectionId,
        )
      : null;

  const context: OptimizerContextDTO = {};

  if (emitCorridors) context.corridors = [buildCorridor(corridor)];
  if (emitTasks) {
    context.tasks = scopedTasks.map(buildTask);
    if (blockRequest !== null) context.block_requests = [blockRequest];
  }
  if (emitAssets) {
    context.assets = forCorridor(snapshot.assets, corridorId).map(buildAsset);
  }
  if (emittedCollections.includes('trains')) {
    context.train_movements = forCorridor(snapshot.trains, corridorId).map(buildTrain);
  }
  if (emittedCollections.includes('goodsForecasts')) {
    context.goods_forecasts = forCorridor(snapshot.goodsForecasts, corridorId).map(buildForecast);
  }
  if (emittedCollections.includes('resources')) {
    context.resources = snapshot.resources.map(buildResource);
  }
  if (emittedCollections.includes('existingBlocks')) {
    context.existing_blocks = snapshot.occupancies
      .filter((occupancy) => occupancy.corridorId === corridorId)
      .map(buildOccupancy);
  }
  if (emittedCollections.includes('priorities')) {
    context.priorities = snapshot.recommendations
      .filter((rec) => rec.taskId !== undefined)
      .map((rec) => ({
        task_id: rec.taskId,
        priority_score: rec.priorityScore,
        recommended_priority: rec.recommendedPriority,
      }));
  }

  const request: OptimizeRequestDTO = {
    // Module 3's contract is snake_case and the client serialises verbatim, so
    // these keys ARE the wire format. `OptimizerBlockRequestPayload` is an opaque
    // Record<string, unknown>, so nothing but this line decides them - and a
    // camelCase key here would be sent to Module 3 as an unknown field.
    request: {
      request_id: blockRequestId,
      task_ids: [...selectedTaskIds],
      corridor_id: corridorId,
      section: firstTask?.sectionId ?? corridor.sectionId,
      requested_start: firstTask?.preferredStart,
      requested_end: firstTask?.preferredEnd,
      // occupancy_type is deliberately absent. Module 3 defaults it to
      // TRAFFIC_BLOCK, and quietly inheriting that default for a possession
      // request is exactly the wrong thing to do quietly. Readiness keeps
      // request.occupancy_type blocking, so reaching here means it was resolved.
    },
    context,
    settings: {},
  };

  const provenance: OptimizerProvenanceEntry[] = [];
  for (const collection of emittedCollections) {
    const value = (context as Record<string, unknown>)[collectionKey(collection)];
    provenance.push(
      entry(
        `context.${collectionKey(collection)}`,
        MAPPED_LABEL,
        Array.isArray(value) ? value.length : null,
        'Copied field-by-field from Module 4 records whose readiness inputs all verified.',
      ),
    );
  }
  for (const { collection, blockedBy } of omitted) {
    provenance.push(
      entry(
        `context.${collectionKey(collection)}`,
        UNAVAILABLE_LABEL,
        null,
        `Not emitted: unsatisfied readiness input(s) ${blockedBy.join(', ')}. Omitted so Module 3 applies its own default rather than being sent a guess.`,
      ),
    );
  }
  for (const collection of UNGATED_COLLECTIONS) {
    provenance.push(
      entry(
        `context.${collection}`,
        UNAVAILABLE_LABEL,
        null,
        'Not emitted: no readiness input verifies a Module 4 -> Module 3 mapping for this collection.',
      ),
    );
  }
  provenance.push(
    entry(
      'request.occupancy_type',
      UNAVAILABLE_LABEL,
      null,
      inputById(readiness, 'request.occupancy_type')?.reason ?? 'No Module 4 source.',
    ),
  );

  return {
    ok: true,
    request,
    readiness,
    provenance,
    emitted: emittedCollections,
    omitted,
  };
}

/** Map an internal collection key to its Module 3 context key. */
function collectionKey(collection: string): string {
  switch (collection) {
    case 'blockRequests':
      return 'block_requests';
    case 'existingBlocks':
      return 'existing_blocks';
    case 'goodsForecasts':
      return 'goods_forecasts';
    case 'trainMovements':
      return 'train_movements';
    default:
      return collection;
  }
}
