import { Conflict } from '../types/conflict';

/**
 * RailOpt Synthetic Demo Data: Operational & Scheduling Conflicts
 * Division: SECUNDERABAD (SEC)
 * 
 * 10 conflicts covering all specified constraint types:
 * - 2 TRAIN conflicts
 * - 2 RESOURCE conflicts
 * - 2 TIME conflicts
 * - 1 CORRIDOR capacity conflict
 * - 1 GOODS forecast clash
 * - 1 DURATION limitation conflict
 * - 1 DEPENDENCY sequencing conflict
 * 
 * All referenced taskIds and blockIds resolve to entities in the mock datasets.
 */
export const mockConflicts: Conflict[] = [
  // ==========================================
  // TRAIN CONFLICTS (2)
  // ==========================================
  {
    // Scenario 2: Passenger Train Conflict
    conflictId: 'CNF-001',
    type: 'TRAIN',
    severity: 'CRITICAL',
    affectedTaskIds: ['TSK-ENG-002'],
    affectedBlockIds: [],
    sectionId: 'SEC-LPI-MBNR',
    description: 'Scheduled Down Express Train D005 traverses section between 02:15 and 02:50, conflicting with requested 90-minute track maintenance window (02:00-03:30).',
    detectedAt: '2026-09-24T08:10:00Z',
    resolutionStatus: 'OPEN',
    suggestedAction: 'Reschedule maintenance start to 03:00 following Train D005 clearance or divert D005 via alternate chord line.',
  },
  {
    conflictId: 'CNF-002',
    type: 'TRAIN',
    severity: 'HIGH',
    affectedTaskIds: ['TSK-ENG-007'],
    affectedBlockIds: [],
    sectionId: 'SEC-SCD-KCG',
    description: 'Midday Up Passenger Express D011 departure at 15:00 overlaps requested daytime bridge maintenance window.',
    detectedAt: '2026-09-24T11:00:00Z',
    resolutionStatus: 'RESOLVED',
    suggestedAction: 'Advance bridge bearing lubrication to 11:30-13:00 corridor slot WIN-002.',
  },

  // ==========================================
  // RESOURCE CONFLICTS (2)
  // ==========================================
  {
    // Scenario 5: Specialized Crew Overbooking
    conflictId: 'CNF-003',
    type: 'RESOURCE',
    severity: 'CRITICAL',
    affectedTaskIds: ['TSK-SNT-001', 'TSK-SNT-002'],
    affectedBlockIds: ['BLK-INT-001'],
    sectionId: 'SEC-SCD-KCG',
    description: 'Specialized Point Machine Squad RES-SNT-001 is concurrently requested by TSK-SNT-001 (02:30-03:15) and TSK-SNT-002 (02:00-02:50).',
    detectedAt: '2026-09-24T08:35:00Z',
    resolutionStatus: 'OPEN',
    suggestedAction: 'Reassign secondary qualified electronic interlocking team RES-SNT-002 to TSK-SNT-002 or postpone signal calibration.',
  },
  {
    conflictId: 'CNF-004',
    type: 'RESOURCE',
    severity: 'HIGH',
    affectedTaskIds: ['TSK-ENG-001', 'TSK-ENG-006'],
    affectedBlockIds: ['BLK-INT-001', 'BLK-INT-003'],
    sectionId: 'SEC-SCD-KCG',
    description: 'Permanent Way Gang RES-ENG-002 was initially double-booked across concurrent blocks on SEC-SCD-KCG and SEC-BMT-FM.',
    detectedAt: '2026-09-24T09:45:00Z',
    resolutionStatus: 'RESOLVED',
    suggestedAction: 'Reallocated spare track gang RES-ENG-005 to manage SEC-BMT-FM packing work.',
  },

  // ==========================================
  // TIME CONFLICTS (2)
  // ==========================================
  {
    conflictId: 'CNF-005',
    type: 'TIME',
    severity: 'HIGH',
    affectedTaskIds: ['TSK-TRC-001', 'TSK-TRC-002'],
    affectedBlockIds: ['BLK-INT-001'],
    sectionId: 'SEC-SCD-KCG',
    description: 'Traction isolator test requested at 03:30 overlaps energized testing window of contact wire splice replacement.',
    detectedAt: '2026-09-24T12:00:00Z',
    resolutionStatus: 'RESOLVED',
    suggestedAction: 'Sequence isolator alignment to commence at 03:45 immediately following 25kV power restoration verification.',
  },
  {
    conflictId: 'CNF-006',
    type: 'TIME',
    severity: 'MEDIUM',
    affectedTaskIds: ['TSK-ENG-004', 'TSK-SNT-004'],
    affectedBlockIds: ['BLK-INT-002'],
    sectionId: 'SEC-LPI-MBNR',
    description: 'S&T starter signal route cable test scheduled at 02:15 precedes track turnout packing completion by 15 minutes.',
    detectedAt: '2026-09-24T12:30:00Z',
    resolutionStatus: 'RESOLVED',
    suggestedAction: 'Stagger S&T start to 02:30 following initial ballast stabilization.',
  },

  // ==========================================
  // CORRIDOR CONFLICT (1)
  // ==========================================
  {
    // Scenario 6: Insufficient Corridor Window
    conflictId: 'CNF-007',
    type: 'CORRIDOR',
    severity: 'CRITICAL',
    affectedTaskIds: ['TSK-ENG-003'],
    affectedBlockIds: ['BLK-INT-005'],
    sectionId: 'SEC-KCG-DR',
    description: 'Corridor availability window WIN-008 is capped at 60 minutes due to Singareni freight density, but requested bridge inspection requires 90 minutes.',
    detectedAt: '2026-09-24T08:20:00Z',
    resolutionStatus: 'UNDER_REVIEW',
    suggestedAction: 'Reduce task scope to 60-minute critical ultrasonic scan under BLK-INT-005; schedule second 45-minute follow-up block.',
  },

  // ==========================================
  // GOODS FORECAST CLASH (1)
  // ==========================================
  {
    // Scenario 3: Goods Flow Forecast Collision
    conflictId: 'CNF-008',
    type: 'GOODS',
    severity: 'HIGH',
    affectedTaskIds: ['TSK-ENG-003'],
    affectedBlockIds: ['BLK-INT-005'],
    sectionId: 'SEC-KCG-DR',
    description: 'High-confidence freight rake forecast GFC-001 (prob: 0.82) projected to enter section at 02:45, colliding with proposed maintenance block.',
    detectedAt: '2026-09-24T08:45:00Z',
    resolutionStatus: 'OPEN',
    suggestedAction: 'Advance maintenance window start to 01:15-02:15 to complete track possession prior to freight rake arrival.',
  },

  // ==========================================
  // DURATION LIMITATION CONFLICT (1)
  // ==========================================
  {
    conflictId: 'CNF-009',
    type: 'DURATION',
    severity: 'MEDIUM',
    affectedTaskIds: ['TSK-TRC-003'],
    affectedBlockIds: [],
    sectionId: 'SEC-LPI-MBNR',
    description: 'Requested 120-minute OHE auto-tensioning work exceeds available afternoon corridor window WIN-005 (75 minutes).',
    detectedAt: '2026-09-24T13:00:00Z',
    resolutionStatus: 'OPEN',
    suggestedAction: 'Transfer maintenance request to night corridor window WIN-004 (120 minutes capacity).',
  },

  // ==========================================
  // DEPENDENCY SEQUENCING CONFLICT (1)
  // ==========================================
  {
    conflictId: 'CNF-010',
    type: 'DEPENDENCY',
    severity: 'HIGH',
    affectedTaskIds: ['TSK-ENG-001', 'TSK-SNT-001'],
    affectedBlockIds: ['BLK-INT-001'],
    sectionId: 'SEC-SCD-KCG',
    description: 'Point machine PM-102A calibration cannot proceed while heavy track tamping machine CSM 08-32 is operating within the turnout detection zone.',
    detectedAt: '2026-09-24T10:00:00Z',
    resolutionStatus: 'RESOLVED',
    suggestedAction: 'Enforce rigid sequential phasing: track machine tamping completes at 02:45; S&T point machine adjustments execute 02:45-03:15.',
  },
];
