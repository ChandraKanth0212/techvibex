/**
 * Phase 9B-8, Decision B — THE POSSESSION/GRANT SYSTEM IS AUTHORITATIVE.
 *
 * Phase 9B-7 left this owner unconfirmed. It is now decided, and the decision
 * turns on a distinction that is easy to blur:
 *
 *   REQUESTED  a planner has asked for an occupancy. `BlockRequest.occupancyType`
 *              records what was asked for.
 *   GRANTED    the possession system has granted one. Only this states what
 *              actually holds, and only this can satisfy Module 3
 *              `request.occupancy_type`.
 *
 * A request is not a grant. Nothing here reads `BlockRequest.occupancyType`,
 * and that is enforced rather than merely intended: the resolver's parameter
 * list takes the granted records and nothing else, so populating all 18 mock
 * block requests with an occupancy type would leave the gate exactly as blocked
 * as it is now.
 *
 * Four substitutes are refused by name, because each looks plausible and each
 * would put the optimizer over track that is already blocked:
 *   - `IntegratedBlock`, including at status `APPROVED`: a planning artefact
 *     produced by the very optimiser that would consume it.
 *   - `Corridor.availableWindows`: a capacity statement carrying no grant
 *     identity, no occupancy type and no related task ids.
 *   - an empty possession set: indistinguishable from "nothing was granted".
 *   - `BlockType` (CORRIDOR/SHADOW/EMERGENCY/ROUTINE): an operational
 *     possession class, not a grant type.
 *
 * Module 3 defaults `occupancy_type` to `TRAFFIC_BLOCK`. That default is not
 * inherited here: it would assert a grant type nobody issued.
 *
 * EVERYTHING HERE IS PURE.
 */

import type { BlockRequest, IntegratedBlock } from '@/types/block';
import type { BlockType } from '@/types/maintenance';
import type { AvailabilityWindow } from '@/types/corridor';
import type {
  ExistingOccupancy,
  GrantedOccupancy,
  PossessionSourceRejection,
  RequestedOccupancy,
} from '@/types/occupancy';
import {
  GRANTED_OCCUPANCY_STATUSES,
  type OptimizerOccupancyStatus,
  type OptimizerOccupancyType,
} from '@/types/optimizer';

/** The one system allowed to say what kind of occupancy exists. */
export const POSSESSION_AUTHORITY = 'POSSESSION_GRANT_SYSTEM' as const;

/**
 * Whether a possession status means the possession was actually granted.
 *
 * `PLANNED` is an intention and `CANCELLED` has been withdrawn, so neither
 * constrains a schedule. Only these two count.
 */
export function isGrantedPossessionStatus(status: OptimizerOccupancyStatus): boolean {
  return (GRANTED_OCCUPANCY_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether a granted record carries every field Module 3 `ExistingBlock` requires.
 *
 * A half-populated record is not partially usable: sending it would place a
 * possession on the network with an unknown extent, so it counts as no record.
 */
export function isCompletePossessionRecord(occupancy: ExistingOccupancy): boolean {
  return (
    typeof occupancy.occupancyId === 'string' && occupancy.occupancyId.length > 0 &&
    typeof occupancy.corridorId === 'string' && occupancy.corridorId.length > 0 &&
    typeof occupancy.section === 'string' && occupancy.section.length > 0 &&
    typeof occupancy.startTime === 'string' && occupancy.startTime.length > 0 &&
    typeof occupancy.endTime === 'string' && occupancy.endTime.length > 0 &&
    isGrantedPossessionStatus(occupancy.status) &&
    typeof occupancy.occupancyType === 'string' && occupancy.occupancyType.length > 0 &&
    Array.isArray(occupancy.relatedTaskIds)
  );
}

/** Wraps a verified record as the granted assertion it is. */
export function asGrantedOccupancy(occupancy: ExistingOccupancy): GrantedOccupancy {
  return {
    assertion: 'GRANTED',
    occupancy,
    authority: POSSESSION_AUTHORITY,
  };
}

/** Describes what a planner asked for, which is never itself a grant. */
export function asRequestedOccupancy(request: BlockRequest): RequestedOccupancy {
  return {
    assertion: 'REQUESTED',
    requestId: request.requestId,
    ...(request.occupancyType !== undefined
      ? { requestedOccupancyType: request.occupancyType }
      : {}),
    assertedBy: 'PLANNER_REQUEST',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Refusing the four plausible substitutes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Anything that might be offered as "the occupancies".
 *
 * Modelled as an explicit union so the refusal is a value, not an exception: a
 * caller has to name which kind of thing it is holding, and the answer says
 * why that kind does not count.
 */
export type PossessionSourceCandidate =
  | { readonly kind: 'POSSESSION_RECORDS'; readonly occupancies: readonly ExistingOccupancy[] }
  | { readonly kind: 'INTEGRATED_BLOCKS'; readonly blocks: readonly IntegratedBlock[] }
  | { readonly kind: 'AVAILABLE_WINDOWS'; readonly windows: readonly AvailabilityWindow[] }
  | { readonly kind: 'REQUESTS'; readonly requests: readonly BlockRequest[] }
  | { readonly kind: 'MODULE_4_BLOCK_TYPES'; readonly blockTypes: readonly BlockType[] };

export type PossessionSourceAssessment =
  | { readonly accepted: true; readonly occupancies: readonly GrantedOccupancy[] }
  | {
      readonly accepted: false;
      readonly reason: PossessionSourceRejection;
      readonly detail: string;
    };

/**
 * Decides whether a candidate is a source of granted possession.
 *
 * Only `POSSESSION_RECORDS` can be accepted, and only the granted, complete ones
 * survive. Every other kind is refused with the specific reason, so the refusal
 * can be surfaced rather than collapsing into "unavailable".
 */
export function assessPossessionSource(
  candidate: PossessionSourceCandidate,
): PossessionSourceAssessment {
  switch (candidate.kind) {
    case 'INTEGRATED_BLOCKS':
      return {
        accepted: false,
        reason: 'INTEGRATED_BLOCK_IS_A_PLANNING_ARTEFACT',
        detail: `${candidate.blocks.length} IntegratedBlock(s) offered as possession. An IntegratedBlock is a planning artefact produced by the optimiser, not an independently granted possession, and it carries no Module 3 occupancy_type. Its status being APPROVED does not change what kind of object it is.`,
      };

    case 'AVAILABLE_WINDOWS':
      return {
        accepted: false,
        reason: 'AVAILABLE_WINDOW_IS_A_CAPACITY_STATEMENT',
        detail: `${candidate.windows.length} AvailabilityWindow(s) offered as possession. A window states whether a corridor can be worked; it carries no grant identity, no occupancy type and no related task ids. "Not blocked" is not "possession granted".`,
      };

    case 'REQUESTS':
      return {
        accepted: false,
        reason: 'REQUEST_IS_NOT_A_GRANT',
        detail: `${candidate.requests.length} BlockRequest(s) offered as possession. A request is an intention to hold an occupancy. It is not a grant, and its blockType and occupancyType are both planning-side assertions.`,
      };

    case 'MODULE_4_BLOCK_TYPES':
      return {
        accepted: false,
        reason: 'MODULE_4_BLOCK_TYPE_IS_NOT_A_GRANT_TYPE',
        detail: `Module 4 BlockType (${candidate.blockTypes.join(' | ') || 'none'}) offered as an occupancy type. BlockType is an operational possession class; Module 3 occupancy_type is a grant type. The two vocabularies are not interconvertible and no correspondence is approved.`,
      };

    case 'POSSESSION_RECORDS': {
      if (candidate.occupancies.length === 0) {
        return {
          accepted: false,
          reason: 'EMPTY_POSSESSION_SET_PROVES_NOTHING',
          detail:
            'The possession set is empty. An empty set is indistinguishable from "no possession has ever been granted", so it is reported as an absent source rather than as a satisfied requirement.',
        };
      }
      const granted = candidate.occupancies
        .filter((o) => isGrantedPossessionStatus(o.status) && isCompletePossessionRecord(o))
        .map(asGrantedOccupancy);
      return { accepted: true, occupancies: granted };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolving the authoritative occupancy for one request
// ─────────────────────────────────────────────────────────────────────────────

export type AuthoritativeRequestOccupancy =
  | {
      readonly status: 'AUTHORITATIVE';
      readonly occupancyType: OptimizerOccupancyType;
      readonly occupancyId: string;
      readonly authority: typeof POSSESSION_AUTHORITY;
    }
  | { readonly status: 'UNAVAILABLE'; readonly reason: string };

/**
 * The authoritative occupancy type for one block request, or an explicit absence.
 *
 * `request.occupancyType` is DELIBERATELY NOT a parameter. The link from a grant
 * to a request is the task: Module 3's `ExistingBlock.related_task_ids` names
 * the work the possession was granted for, and a `BlockRequest` names its `taskId`.
 * There is no `requestId` on `ExistingOccupancy`, and inventing one would
 * fabricate a field Module 3 does not have.
 *
 * Two granted possessions of DIFFERENT types for the same task is a real
 * contradiction rather than a tie to break, so it fails explicitly. A silent
 * choice between them would be a scheduling decision made by a data reader.
 */
export function resolveAuthoritativeRequestOccupancy(
  request: Pick<BlockRequest, 'requestId' | 'taskId'>,
  occupancies: readonly ExistingOccupancy[],
): AuthoritativeRequestOccupancy {
  const granted = occupancies.filter(
    (o) => isGrantedPossessionStatus(o.status) && isCompletePossessionRecord(o),
  );

  const forTask = granted.filter((o) => o.relatedTaskIds.includes(request.taskId));

  if (forTask.length === 0) {
    const requested = request as Partial<BlockRequest>;
    const requestedNote =
      requested.occupancyType !== undefined
        ? ` The request states a requested occupancyType of ${requested.occupancyType}, which is an intention, not a grant, so it is not used.`
        : '';
    return {
      status: 'UNAVAILABLE',
      reason: `No granted possession covers task ${request.taskId}.${requestedNote} Only the possession system can state the granted occupancy type, and Module 3's TRAFFIC_BLOCK default is not inherited in its place.`,
    };
  }

  const distinct = [...new Set(forTask.map((o) => o.occupancyType))].sort();
  if (distinct.length > 1) {
    return {
      status: 'UNAVAILABLE',
      reason: `Task ${request.taskId} has ${forTask.length} granted possessions with conflicting occupancy types (${distinct.join(' | ')}). Picking one would be a scheduling decision made by a data reader, so this fails explicitly.`,
    };
  }

  const occupancy = [...forTask].sort((a, b) => a.occupancyId.localeCompare(b.occupancyId))[0];
  return {
    status: 'AUTHORITATIVE',
    occupancyType: occupancy.occupancyType,
    occupancyId: occupancy.occupancyId,
    authority: POSSESSION_AUTHORITY,
  };
}
