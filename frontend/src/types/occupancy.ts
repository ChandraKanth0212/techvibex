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
