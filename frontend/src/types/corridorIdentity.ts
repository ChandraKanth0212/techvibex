/**
 * RailOpt Corridor Identity Contracts (Phase 9B-2A)
 *
 * Module 3 (Optimization Engine) requires an explicit `corridor_id` on
 * MaintenanceTask, BlockRequest, Asset, TrainMovement, ExistingBlock and
 * GoodsForecast. Module 4 models `sectionId` but did not carry a corridor
 * reference, so those entities now declare an OPTIONAL `corridorId`.
 *
 * Rules encoded here:
 *  - A corridorId is `MAPPED_FROM_MODULE_4` only when the Module 4 entity
 *    itself carries it, or a user explicitly selected a Module 4 `Corridor`.
 *  - A corridorId is NEVER reconstructed from a sectionId string. Section ids
 *    such as `SEC-SCD-KCG` (Module 4) and `COR-001-S1` (Module 3) carry no
 *    parseable corridor, and a section prefix is not a corridor.
 *  - When no explicit corridor is available the result is
 *    `UNAVAILABLE_FROM_MODULE_4` with `corridorId: null`. A corridor candidate
 *    inferred from corridor topology is reported separately and is never
 *    promoted to a corridorId.
 *
 * `MODULE_3_DEFAULT` is deliberately absent from this union: defaulting a
 * corridor would fabricate a Module 3 `corridor_id` out of nothing.
 */

export type CorridorIdSource =
  | 'MAPPED_FROM_MODULE_4'
  | 'MODULE_3_SYNTHETIC_DEMO'
  | 'UNAVAILABLE_FROM_MODULE_4';

/** Minimal shape shared by every Module 4 entity that can bear a corridor. */
export interface CorridorBearing {
  corridorId?: string;
  sectionId?: string;
}

export interface CorridorIdentity {
  /** Explicit, trustworthy corridor id. `null` whenever unavailable. */
  corridorId: string | null;
  /** Section the entity belongs to, kept for display and for future builders. */
  sectionId: string | null;
  source: CorridorIdSource;
  /** Human-readable justification for the assigned `source`. */
  reason: string;
  /**
   * Corridor that owns `sectionId` per Module 4 `Corridor.sectionId`, when
   * exactly one corridor claims it. Advisory only: it is never a corridorId.
   */
  candidateCorridorId: string | null;
}

/**
 * Corridor-to-section relation as Module 4 actually models it. Module 4's
 * `Corridor` exposes a single `sectionId`, so a section may be claimed by more
 * than one corridor; ambiguous sections resolve to no candidate at all.
 */
export interface CorridorTopology {
  byCorridorId: ReadonlyMap<string, string>;
  bySectionId: ReadonlyMap<string, readonly string[]>;
}
