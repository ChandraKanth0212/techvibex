/**
 * RailOpt Domain Entity: Corridor & AvailabilityWindow
 * Represents railway track corridors, section lines, restrictions, and available maintenance windows.
 */

export type LineType = 'UP' | 'DOWN' | 'THIRD_LINE' | 'SINGLE_LINE';
export type AvailabilityWindowStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'RESTRICTED';
export type CorridorStatus = 'OPERATIONAL' | 'CONGESTED' | 'BLOCKED' | 'MAINTENANCE_IN_PROGRESS';

export interface AvailabilityWindow {
  windowId: string;
  start: string; // ISO datetime string
  end: string;   // ISO datetime string
  durationMinutes: number;
  status: AvailabilityWindowStatus;
  restriction?: string;
}

export interface Corridor {
  corridorId: string;
  /**
   * Module 3 `corridors[].name`, a non-empty string Module 3 rejects as empty.
   *
   * Module 4 names a corridor by id and by its `fromStation`/`toStation` pair.
   * Neither is this field, and concatenating them would invent a name, so this
   * is declared separately and left unset until a person states it.
   */
  name?: string;
  sectionId: string;
  /**
   * Every section the corridor spans, for consumers that need the full extent.
   *
   * Module 3 `corridors[].sections` is a list, whereas the Module 4 model
   * records exactly one `sectionId` per corridor. `sections` is therefore
   * optional and is NEVER back-filled from `sectionId`, from the corridor id, or
   * from neighbouring corridors: topology that has not been surveyed must read
   * as absent. `sectionId` remains the single declared section.
   */
  sections?: string[];
  fromStation: string;
  toStation: string;
  line: LineType;
  date: string; // ISO date string (YYYY-MM-DD)
  availableWindows: AvailabilityWindow[];
  restrictions: string[];
  capacity: number;
  status: CorridorStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9B-8, Decision E: authoritative, ordered corridor topology.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shape the authoritative topology source must deliver.
 *
 * A contract, not data. Module 4 records a corridor as ONE section
 * (`Corridor.sectionId`); Module 3 needs the ordered extent of the route, so
 * that possession, gauging and speed limits can be reasoned about per section
 * and a multi-section route can be released only in part.
 *
 * `orderedSectionIds` is ORDERED, not a set, and the order is load-bearing
 * rather than incidental: it is traversal order. That is why a single-element
 * list naming `Corridor.sectionId` is a refusal and not a near-miss — it would
 * assert the route has no internal structure.
 */
export interface CorridorTopologyRecord {
  corridorId: string;
  /** Traversal order. Non-empty; never synthesised. */
  orderedSectionIds: readonly string[];
  /**
   * Direction this topology describes, where a route differs by direction. A
   * single ordered list cannot express both directions of a bidirectional
   * corridor, so the direction is part of the record rather than implied.
   */
  direction?: LineType;
  /** ISO date string (YYYY-MM-DD) from which this topology is in force. */
  effectiveFrom?: string;
  /** Source version, so a historical plan can be reproduced. */
  version?: string;
}

/**
 * The authoritative source of {@link CorridorTopologyRecord}s.
 *
 * Deliberately left unimplemented. No Module 4 store satisfies this; readiness
 * reports the absence, and `resolvableByUserAction` stays `false` because a
 * survey cannot be produced from within this application.
 */
export interface CorridorTopologySource {
  readonly topology: readonly CorridorTopologyRecord[];
}
