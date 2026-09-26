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
