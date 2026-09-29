/**
 * RailOpt Domain Entity: ExistingOccupancy
 *
 * A record of track possession that has already been granted — "a block already
 * on the books", in Module 3's words. It exists because Module 4 had no entity
 * for it: `IntegratedBlock` (@/types/block) is a *proposal produced by planning*
 * and `Corridor.availableWindows` (@/types/corridor) is a *capacity statement*.
 * Neither is a record of a possession someone has actually granted, so neither
 * may be used as one.
 *
 * WHY THIS IS A SEPARATE TYPE
 * ---------------------------
 * Keeping this apart from `IntegratedBlock` is the whole point. An
 * `IntegratedBlock` carries `status: 'AI_PROPOSED' | 'UNDER_REVIEW' | ...` and
 * `source: 'MANUAL' | 'OPTIMIZER_GENERATED' | 'AI_RECOMMENDED'`; it is an output
 * of planning, and a proposal that happens to reach `APPROVED` is still a
 * planning artifact rather than an independently granted possession record.
 * Allowing one to stand in for the other would let the optimizer treat its own
 * suggestions as ground truth.
 *
 * The field set mirrors Module 3 `ExistingBlock` (`optimizer/contracts/existing_block.py`)
 * one-for-one, so a record of this shape is directly translatable:
 *   occupancyId     -> block_id          corridorId   -> corridor_id
 *   section         -> section           startTime    -> start_time
 *   endTime         -> end_time          occupancyType-> occupancy_type
 *   status          -> status            relatedTaskIds -> related_task_ids
 *
 * `corridorId` is REQUIRED here, unlike on other Module 4 entities. Possession is
 * granted on a specific corridor; a record that cannot name it is not a usable
 * input, and making the field optional would only defer that discovery.
 *
 * These are contracts only. No Module 4 source populates them yet, and nothing
 * derives them from `IntegratedBlock` or `availableWindows`.
 */

import type {
  OptimizerOccupancyStatus,
  OptimizerOccupancyType,
} from './optimizer';

export type { OptimizerOccupancyStatus, OptimizerOccupancyType };

export interface ExistingOccupancy {
  occupancyId: string;
  /** Required: possession is granted on a named corridor. */
  corridorId: string;
  /** Section the possession covers. */
  section: string;
  /** ISO datetime string. */
  startTime: string;
  /** ISO datetime string; must be after `startTime`. */
  endTime: string;
  status: OptimizerOccupancyStatus;
  occupancyType: OptimizerOccupancyType;
  /** Tasks this possession was granted for. May be empty, never inferred. */
  relatedTaskIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9B-8, Decision B: the possession/grant system is authoritative.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single system entitled to state what kind of occupancy exists.
 *
 * Phase 9B-7 left this owner unconfirmed. It is now decided, and the decision
 * has a consequence that is easy to get wrong: a request is not a grant.
 * `BlockRequest.occupancyType` records what a planner ASKED for; only a granted
 * {@link ExistingOccupancy} states what was actually granted.
 */
export const OCCUPANCY_AUTHORITY = 'POSSESSION_GRANT_SYSTEM' as const;
export type OccupancyAuthority = typeof OCCUPANCY_AUTHORITY;

/**
 * A REQUESTED occupancy: an intention, recorded by the requesting side.
 *
 * Kept as its own type, and structurally incapable of standing in for a grant:
 * it carries no `status`, no `occupancyId` and no `startTime`/`endTime`, so it
 * cannot be passed where an {@link ExistingOccupancy} is required.
 */
export interface RequestedOccupancy {
  readonly assertion: 'REQUESTED';
  /** The `BlockRequest.requestId` that asked for this. */
  readonly requestId: string;
  /** What the requester asked for. NOT authoritative. */
  readonly requestedOccupancyType?: OptimizerOccupancyType;
  /**
   * Always the requester. Present so that a consumer can see WHO asserted this
   * without having to infer it from the absence of a status field.
   */
  readonly assertedBy: 'PLANNER_REQUEST';
}

/**
 * A GRANTED occupancy: what the possession system actually granted.
 *
 * Structurally an {@link ExistingOccupancy}, so it is the one thing that can
 * satisfy Module 3 `request.occupancy_type`, and only while its status is
 * {@link GRANTED_OCCUPANCY_STATUSES}.
 */
export interface GrantedOccupancy {
  readonly assertion: 'GRANTED';
  readonly occupancy: ExistingOccupancy;
  readonly authority: OccupancyAuthority;
}

/**
 * Either side of the distinction, so a caller cannot hold "an occupancy" without
 * saying which kind it is.
 */
export type OccupancyAssertion = RequestedOccupancy | GrantedOccupancy;

/**
 * Why a candidate is not a source of granted possession.
 *
 * Every value names a specific thing that was refused, because "not available"
 * would hide the difference between a missing system, a wrong kind of record,
 * and an empty answer that merely looks like success.
 */
export type PossessionSourceRejection =
  /** An `IntegratedBlock`: a planning artefact, even at status APPROVED. */
  | 'INTEGRATED_BLOCK_IS_A_PLANNING_ARTEFACT'
  /** `Corridor.availableWindows`: a capacity statement, not a possession. */
  | 'AVAILABLE_WINDOW_IS_A_CAPACITY_STATEMENT'
  /** An empty set, which is indistinguishable from "nothing was ever granted". */
  | 'EMPTY_POSSESSION_SET_PROVES_NOTHING'
  /** A `BlockRequest`: asking for possession is not holding it. */
  | 'REQUEST_IS_NOT_A_GRANT'
  /** A possession record whose status is not APPROVED or ACTIVE. */
  | 'POSSESSION_NOT_YET_GRANTED'
  /** A granted record missing a field Module 3 ExistingBlock requires. */
  | 'POSSESSION_RECORD_INCOMPLETE'
  /** `BlockType` (CORRIDOR/SHADOW/EMERGENCY/ROUTINE) is not a grant type. */
  | 'MODULE_4_BLOCK_TYPE_IS_NOT_A_GRANT_TYPE';
