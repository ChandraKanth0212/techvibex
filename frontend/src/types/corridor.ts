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
  sectionId: string;
  fromStation: string;
  toStation: string;
  line: LineType;
  date: string; // ISO date string (YYYY-MM-DD)
  availableWindows: AvailabilityWindow[];
  restrictions: string[];
  capacity: number;
  status: CorridorStatus;
}
