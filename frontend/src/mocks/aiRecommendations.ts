import { AIRecommendation } from '../types/ai';

/**
 * RailOpt Synthetic Demo Data: AI Optimization & Decision Recommendations
 * Division: SECUNDERABAD (SEC)
 * 
 * 7 synthetic recommendation results simulating outputs from Modules 2 & 3:
 * - INTEGRATED_BLOCK (Multi-department bundling)
 * - RESCHEDULE (Train collision avoidance)
 * - PRIORITIZE (Critical safety escalation)
 * - CONFLICT_RESOLUTION (Resource allocation & window shifting)
 * - DEFER (Congestion avoidance)
 */
export const mockAIRecommendations: AIRecommendation[] = [
  // ==========================================
  // 1. INTEGRATED BLOCK BUNDLING (Scenario 1)
  // ==========================================
  {
    recommendationId: 'REC-001',
    type: 'INTEGRATED_BLOCK',
    status: 'ACCEPTED',
    affectedTaskIds: ['TSK-ENG-001', 'TSK-SNT-001', 'TSK-TRC-001'],
    affectedBlockIds: ['BLK-INT-001'],
    proposedWindow: {
      startTime: '2026-09-25T02:00:00Z',
      endTime: '2026-09-25T03:45:00Z',
      durationMinutes: 105,
    },
    departments: ['ENGINEERING', 'SNT', 'TRACTION'],
    reasons: [
      'All three tasks operate on the same physical section SEC-SCD-KCG within adjacent mileposts (Km 12/0-13/8).',
      'Required combined duration fits within corridor availability window WIN-001 (150 minutes).',
      'No scheduled passenger movement overlaps the proposed window.',
      'Bundling 3 departmental requests into a single possession window prevents 75 minutes of cumulative line downtime.',
    ],
    constraintResults: {
      corridorAvailable: true,
      requiredDurationSatisfied: true,
      passengerTrainConflict: false,
      goodsTrainConflict: false,
      resourceConflict: false,
      locationConflict: false,
      dependencyConflict: false,
      overallFeasible: true,
    },
    operationalImpact: {
      trainsAffectedCount: 0,
      totalDelayMinutes: 0,
      estimatedFreightThroughputImpact: 'NEGLIGIBLE',
      safetyRiskIndex: 0.12,
    },
    createdAt: '2026-09-24T08:15:00Z',
  },

  // ==========================================
  // 2. RESCHEDULE TO AVOID TRAIN (Scenario 2)
  // ==========================================
  {
    recommendationId: 'REC-002',
    type: 'RESCHEDULE',
    status: 'PROPOSED',
    affectedTaskIds: ['TSK-ENG-002'],
    affectedBlockIds: [],
    proposedWindow: {
      startTime: '2026-09-25T03:00:00Z',
      endTime: '2026-09-25T04:30:00Z',
      durationMinutes: 90,
    },
    departments: ['ENGINEERING'],
    reasons: [
      'High priority passenger Express D005 traverses section SEC-LPI-MBNR between 02:15 and 02:50.',
      'Shifting start time by 60 minutes to 03:00 clears track possession after Train D005 departs.',
      'Maintains complete 90-minute required maintenance duration before morning commuter rush.',
    ],
    constraintResults: {
      corridorAvailable: true,
      requiredDurationSatisfied: true,
      passengerTrainConflict: false,
      goodsTrainConflict: false,
      resourceConflict: false,
      locationConflict: false,
      dependencyConflict: false,
      overallFeasible: true,
    },
    operationalImpact: {
      trainsAffectedCount: 0,
      totalDelayMinutes: 0,
      estimatedFreightThroughputImpact: 'NONE',
      safetyRiskIndex: 0.15,
    },
    createdAt: '2026-09-24T08:40:00Z',
  },

  // ==========================================
  // 3. SAFETY ESCALATION & PRIORITIZE (Scenario 4)
  // ==========================================
  {
    recommendationId: 'REC-003',
    type: 'PRIORITIZE',
    status: 'ACCEPTED',
    affectedTaskIds: ['TSK-ENG-001'],
    affectedBlockIds: ['BLK-INT-001'],
    proposedWindow: {
      startTime: '2026-09-25T02:00:00Z',
      endTime: '2026-09-25T03:30:00Z',
      durationMinutes: 90,
    },
    departments: ['ENGINEERING'],
    reasons: [
      'Rail weld crack defect DEF-001 exhibits VERY_HIGH derailment risk under dynamic axle loading.',
      'Work order is 14 days overdue on a primary high-speed passenger mainline.',
      'Composite safety criticality index scored 0.94; automated system elevates request to Priority 1.',
    ],
    constraintResults: {
      corridorAvailable: true,
      requiredDurationSatisfied: true,
      passengerTrainConflict: false,
      goodsTrainConflict: false,
      resourceConflict: false,
      locationConflict: false,
      dependencyConflict: false,
      overallFeasible: true,
    },
    operationalImpact: {
      trainsAffectedCount: 0,
      totalDelayMinutes: 0,
      estimatedFreightThroughputImpact: 'NONE',
      safetyRiskIndex: 0.05,
    },
    createdAt: '2026-09-24T07:00:00Z',
  },

  // ==========================================
  // 4. RESOURCE SUBSTITUTION CONFLICT RESOLUTION (Scenario 5)
  // ==========================================
  {
    recommendationId: 'REC-004',
    type: 'CONFLICT_RESOLUTION',
    status: 'ACCEPTED',
    affectedTaskIds: ['TSK-SNT-001', 'TSK-SNT-002'],
    affectedBlockIds: ['BLK-INT-001'],
    proposedWindow: {
      startTime: '2026-09-25T02:30:00Z',
      endTime: '2026-09-25T03:30:00Z',
      durationMinutes: 60,
    },
    departments: ['SNT'],
    reasons: [
      'Both tasks contended for specialized Point Machine Squad RES-SNT-001 during overlapping night intervals.',
      'Assigning spare certified squad RES-SNT-002 to TSK-SNT-002 clears resource contention completely.',
      'Preserves original schedule for both urgent safety work orders without requiring block cancellation.',
    ],
    constraintResults: {
      corridorAvailable: true,
      requiredDurationSatisfied: true,
      passengerTrainConflict: false,
      goodsTrainConflict: false,
      resourceConflict: false,
      locationConflict: false,
      dependencyConflict: false,
      overallFeasible: true,
    },
    operationalImpact: {
      trainsAffectedCount: 0,
      totalDelayMinutes: 0,
      estimatedFreightThroughputImpact: 'NONE',
      safetyRiskIndex: 0.10,
    },
    createdAt: '2026-09-24T09:00:00Z',
  },

  // ==========================================
  // 5. DEFER TASK DUE TO FESTIVAL CONGESTION
  // ==========================================
  {
    recommendationId: 'REC-005',
    type: 'DEFER',
    status: 'PROPOSED',
    affectedTaskIds: ['TSK-ENG-008'],
    affectedBlockIds: ['BLK-INT-006'],
    proposedWindow: {
      startTime: '2026-10-12T01:30:00Z',
      endTime: '2026-10-12T03:00:00Z',
      durationMinutes: 90,
    },
    departments: ['ENGINEERING'],
    reasons: [
      'Section SEC-LPI-HYB is operating under extraordinary festival express traffic into Hyderabad Deccan terminal.',
      'Task TSK-ENG-008 is routine track gauge inspection with 0 overdue days and LOW risk.',
      'Executing this block would inflict an estimated 180 minutes of total passenger delay across 6 rakes.',
    ],
    constraintResults: {
      corridorAvailable: false,
      requiredDurationSatisfied: true,
      passengerTrainConflict: true,
      goodsTrainConflict: false,
      resourceConflict: false,
      locationConflict: false,
      dependencyConflict: false,
      overallFeasible: false,
    },
    operationalImpact: {
      trainsAffectedCount: 6,
      totalDelayMinutes: 180,
      estimatedFreightThroughputImpact: 'MEDIUM',
      safetyRiskIndex: 0.25,
    },
    createdAt: '2026-09-24T11:45:00Z',
  },

  // ==========================================
  // 6. FUTURE INTEGRATED BLOCK BUNDLE (Scenario 8)
  // ==========================================
  {
    recommendationId: 'REC-006',
    type: 'INTEGRATED_BLOCK',
    status: 'PROPOSED',
    affectedTaskIds: ['TSK-SNT-006', 'TSK-TRC-007'],
    affectedBlockIds: ['BLK-INT-007'],
    proposedWindow: {
      startTime: '2026-10-04T02:00:00Z',
      endTime: '2026-10-04T03:15:00Z',
      durationMinutes: 75,
    },
    departments: ['SNT', 'TRACTION'],
    reasons: [
      'Both works are on SEC-KCG-DR corridor near Km 78 during night maintenance window.',
      'Pairs S&T axle counter board replacement with Traction neutral section insulator maintenance.',
      'Saves 45 minutes of freight corridor closure on heavy coal transport route.',
    ],
    constraintResults: {
      corridorAvailable: true,
      requiredDurationSatisfied: true,
      passengerTrainConflict: false,
      goodsTrainConflict: false,
      resourceConflict: false,
      locationConflict: false,
      dependencyConflict: false,
      overallFeasible: true,
    },
    operationalImpact: {
      trainsAffectedCount: 0,
      totalDelayMinutes: 0,
      estimatedFreightThroughputImpact: 'LOW',
      safetyRiskIndex: 0.14,
    },
    createdAt: '2026-09-24T12:30:00Z',
  },

  // ==========================================
  // 7. FREIGHT & CORRIDOR CONFLICT RESOLUTION (Scenarios 3 & 6)
  // ==========================================
  {
    recommendationId: 'REC-007',
    type: 'CONFLICT_RESOLUTION',
    status: 'PROPOSED',
    affectedTaskIds: ['TSK-ENG-003'],
    affectedBlockIds: ['BLK-INT-005'],
    proposedWindow: {
      startTime: '2026-09-25T01:15:00Z',
      endTime: '2026-09-25T02:15:00Z',
      durationMinutes: 60,
    },
    departments: ['ENGINEERING'],
    reasons: [
      'Singareni coal freight rake GFC-001 (prob: 0.82) crosses section at 02:45.',
      'Corridor capacity window WIN-008 strictly limits possession to 60 minutes.',
      'Advancing block to 01:15-02:15 completes bridge ultrasonic scanning before freight train arrival while satisfying 60m ceiling.',
    ],
    constraintResults: {
      corridorAvailable: true,
      requiredDurationSatisfied: true,
      passengerTrainConflict: false,
      goodsTrainConflict: false,
      resourceConflict: false,
      locationConflict: false,
      dependencyConflict: false,
      overallFeasible: true,
    },
    operationalImpact: {
      trainsAffectedCount: 0,
      totalDelayMinutes: 0,
      estimatedFreightThroughputImpact: 'NONE',
      safetyRiskIndex: 0.16,
    },
    createdAt: '2026-09-24T09:15:00Z',
  },
];
