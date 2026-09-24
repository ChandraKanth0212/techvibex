import { Corridor } from '../types/corridor';

/**
 * RailOpt Synthetic Demo Data: Railway Corridors
 * Division: SECUNDERABAD (SEC)
 * 
 * 5 primary divisional corridors with availability windows, capacity quotas,
 * and operational speed/traffic restrictions.
 */
export const mockCorridors: Corridor[] = [
  {
    corridorId: 'CORR-001',
    sectionId: 'SEC-SCD-KCG',
    fromStation: 'SECUNDERABAD',
    toStation: 'KACHEGUDA',
    line: 'UP',
    date: '2026-09-25',
    availableWindows: [
      {
        windowId: 'WIN-001',
        start: '2026-09-25T01:30:00Z',
        end: '2026-09-25T04:00:00Z',
        durationMinutes: 150,
        status: 'AVAILABLE',
        restriction: 'Night traffic slot; requires 15m clearance before first morning suburban EMU',
      },
      {
        windowId: 'WIN-002',
        start: '2026-09-25T11:30:00Z',
        end: '2026-09-25T13:00:00Z',
        durationMinutes: 90,
        status: 'AVAILABLE',
        restriction: 'Midday passenger lull window; shadow blocks permitted on loop lines only',
      },
      {
        windowId: 'WIN-003',
        start: '2026-09-25T22:30:00Z',
        end: '2026-09-25T23:45:00Z',
        durationMinutes: 75,
        status: 'AVAILABLE',
      },
    ],
    restrictions: [
      'Caution order 30 km/h on Bridge 14 due to spillway structure inspection',
      'Traction power supply alternate feed required via Begumpet TSS during OHE work',
    ],
    capacity: 48, // max trains/day
    status: 'OPERATIONAL',
  },
  {
    corridorId: 'CORR-002',
    sectionId: 'SEC-LPI-MBNR',
    fromStation: 'LINGAMPALLI',
    toStation: 'MAHBUBNAGAR',
    line: 'DOWN',
    date: '2026-09-25',
    availableWindows: [
      {
        windowId: 'WIN-004',
        start: '2026-09-25T01:45:00Z',
        end: '2026-09-25T03:45:00Z',
        durationMinutes: 120,
        status: 'AVAILABLE',
        restriction: 'Intermittent crossing conflict with Express D005 between 02:15 and 02:50',
      },
      {
        windowId: 'WIN-005',
        start: '2026-09-25T14:00:00Z',
        end: '2026-09-25T15:15:00Z',
        durationMinutes: 75,
        status: 'RESTRICTED',
        restriction: 'High freight movement density; maximum block grant 75 mins',
      },
    ],
    restrictions: [
      'Down line automated signaling headway clamped to 8 minutes',
      'Heavy freight rake crossing priorities at Umda Nagar station',
    ],
    capacity: 42,
    status: 'CONGESTED',
  },
  {
    corridorId: 'CORR-003',
    sectionId: 'SEC-BMT-FM',
    fromStation: 'BEGUMPET',
    toStation: 'FALAKNUMA',
    line: 'SINGLE_LINE',
    date: '2026-09-25',
    availableWindows: [
      {
        windowId: 'WIN-006',
        start: '2026-09-25T02:00:00Z',
        end: '2026-09-25T03:30:00Z',
        durationMinutes: 90,
        status: 'AVAILABLE',
      },
      {
        windowId: 'WIN-007',
        start: '2026-09-25T23:00:00Z',
        end: '2026-09-26T00:30:00Z',
        durationMinutes: 90,
        status: 'AVAILABLE',
      },
    ],
    restrictions: [
      'Single line tokenless block territory; total line possession halts both directions',
      'No concurrent diesel loco idling permitted under OHE neutral section',
    ],
    capacity: 28,
    status: 'OPERATIONAL',
  },
  {
    corridorId: 'CORR-004',
    sectionId: 'SEC-KCG-DR',
    fromStation: 'KACHEGUDA',
    toStation: 'DR-JUNCTION',
    line: 'UP',
    date: '2026-09-25',
    availableWindows: [
      {
        windowId: 'WIN-008',
        start: '2026-09-25T02:30:00Z',
        end: '2026-09-25T03:30:00Z',
        durationMinutes: 60,
        status: 'RESTRICTED',
        restriction: 'Severe line capacity bottleneck; strictly restricted to 60 minutes max possession',
      },
      {
        windowId: 'WIN-009',
        start: '2026-09-25T13:30:00Z',
        end: '2026-09-25T14:30:00Z',
        durationMinutes: 60,
        status: 'OCCUPIED',
        restriction: 'Occupied by daily priority goods train paths',
      },
    ],
    restrictions: [
      'Permanent Speed Restriction (PSR) 30 km/h over Bridge 88',
      'Continuous coal freight corridor from Singareni collieries; high track occupancy',
    ],
    capacity: 34,
    status: 'CONGESTED',
  },
  {
    corridorId: 'CORR-005',
    sectionId: 'SEC-LPI-HYB',
    fromStation: 'LINGAMPALLI',
    toStation: 'HYDERABAD_DECCAN',
    line: 'UP',
    date: '2026-09-25',
    availableWindows: [
      {
        windowId: 'WIN-010',
        start: '2026-09-25T01:00:00Z',
        end: '2026-09-25T02:30:00Z',
        durationMinutes: 90,
        status: 'AVAILABLE',
      },
      {
        windowId: 'WIN-011',
        start: '2026-09-25T10:30:00Z',
        end: '2026-09-25T12:00:00Z',
        durationMinutes: 90,
        status: 'AVAILABLE',
      },
    ],
    restrictions: [
      'Suburban MMTS local train priority section between 06:00 and 22:00',
      'No day blocks permitted during festival travel peaks',
    ],
    capacity: 52,
    status: 'OPERATIONAL',
  },
];
