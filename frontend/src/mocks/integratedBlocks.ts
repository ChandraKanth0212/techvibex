import { IntegratedBlock } from '../types/block';

/**
 * RailOpt Synthetic Demo Data: Integrated Blocks (Planning Outputs)
 * Division: SECUNDERABAD (SEC)
 * 
 * 8 representative planning outputs matching all required prototype scenarios:
 * 1. Successful 3-department integration (APPROVED)
 * 2. Engineering + S&T integration (UNDER_REVIEW)
 * 3. Engineering + Traction integration (UNDER_REVIEW)
 * 4. Single-department block (COMPLETED)
 * 5. Modified block (MODIFIED - shifted to resolve freight train clash)
 * 6. Rejected block (REJECTED - festival congestion refusal)
 * 7. AI-proposed block (AI_PROPOSED - future corridor bundling)
 * 8. Published block (PUBLISHED - finalized master plan)
 */
export const mockIntegratedBlocks: IntegratedBlock[] = [
  // ==========================================
  // 1. SUCCESSFUL THREE-DEPARTMENT INTEGRATED BLOCK (Scenario 1)
  // ==========================================
  {
    blockId: 'BLK-INT-001',
    date: '2026-09-25',
    sectionId: 'SEC-SCD-KCG',
    fromStation: 'SECUNDERABAD',
    toStation: 'KACHEGUDA',
    startTime: '2026-09-25T02:00:00Z',
    endTime: '2026-09-25T03:45:00Z',
    durationMinutes: 105,
    departments: ['ENGINEERING', 'SNT', 'TRACTION'],
    taskIds: ['TSK-ENG-001', 'TSK-SNT-001', 'TSK-TRC-001'],
    requestIds: ['REQ-001', 'REQ-002', 'REQ-003'],
    status: 'APPROVED',
    constraintValidation: {
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
    source: 'OPTIMIZER_GENERATED',
  },

  // ==========================================
  // 2. ENGINEERING + SNT INTEGRATION (Scenario 7)
  // ==========================================
  {
    blockId: 'BLK-INT-002',
    date: '2026-09-27',
    sectionId: 'SEC-LPI-MBNR',
    fromStation: 'LINGAMPALLI',
    toStation: 'MAHBUBNAGAR',
    startTime: '2026-09-27T02:00:00Z',
    endTime: '2026-09-27T03:15:00Z',
    durationMinutes: 75,
    departments: ['ENGINEERING', 'SNT'],
    taskIds: ['TSK-ENG-004', 'TSK-SNT-004'],
    requestIds: ['REQ-007', 'REQ-008'],
    status: 'UNDER_REVIEW',
    constraintValidation: {
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
      safetyRiskIndex: 0.18,
    },
    source: 'OPTIMIZER_GENERATED',
  },

  // ==========================================
  // 3. ENGINEERING + TRACTION INTEGRATION (Scenario 7)
  // ==========================================
  {
    blockId: 'BLK-INT-003',
    date: '2026-09-25',
    sectionId: 'SEC-BMT-FM',
    fromStation: 'BEGUMPET',
    toStation: 'FALAKNUMA',
    startTime: '2026-09-25T02:00:00Z',
    endTime: '2026-09-25T03:00:00Z',
    durationMinutes: 60,
    departments: ['ENGINEERING', 'TRACTION'],
    taskIds: ['TSK-ENG-006', 'TSK-TRC-006'],
    requestIds: ['REQ-009', 'REQ-010'],
    status: 'UNDER_REVIEW',
    constraintValidation: {
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
    source: 'MANUAL',
  },

  // ==========================================
  // 4. SINGLE-DEPARTMENT BLOCK (SNT Routine)
  // ==========================================
  {
    blockId: 'BLK-INT-004',
    date: '2026-09-24',
    sectionId: 'SEC-LPI-HYB',
    fromStation: 'LINGAMPALLI',
    toStation: 'HYDERABAD_DECCAN',
    startTime: '2026-09-24T01:30:00Z',
    endTime: '2026-09-24T02:30:00Z',
    durationMinutes: 60,
    departments: ['SNT'],
    taskIds: ['TSK-SNT-008'],
    requestIds: ['REQ-018'],
    status: 'COMPLETED',
    constraintValidation: {
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
      safetyRiskIndex: 0.08,
    },
    source: 'MANUAL',
  },

  // ==========================================
  // 5. MODIFIED BLOCK (Scenarios 3 & 6 - Rescheduled to clear freight rake)
  // ==========================================
  {
    blockId: 'BLK-INT-005',
    date: '2026-09-25',
    sectionId: 'SEC-KCG-DR',
    fromStation: 'KACHEGUDA',
    toStation: 'DR-JUNCTION',
    startTime: '2026-09-25T01:15:00Z',
    endTime: '2026-09-25T02:15:00Z',
    durationMinutes: 60,
    departments: ['ENGINEERING'],
    taskIds: ['TSK-ENG-003'],
    requestIds: ['REQ-005'],
    status: 'MODIFIED',
    constraintValidation: {
      corridorAvailable: true,
      requiredDurationSatisfied: true, // Reduced scope to fit 60m limit
      passengerTrainConflict: false,
      goodsTrainConflict: false, // Cleared before GFC-001 arrival at 02:45
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
    source: 'OPTIMIZER_GENERATED',
  },

  // ==========================================
  // 6. REJECTED BLOCK (Festival passenger rush rejection)
  // ==========================================
  {
    blockId: 'BLK-INT-006',
    date: '2026-10-12',
    sectionId: 'SEC-LPI-HYB',
    fromStation: 'LINGAMPALLI',
    toStation: 'HYDERABAD_DECCAN',
    startTime: '2026-10-12T01:30:00Z',
    endTime: '2026-10-12T03:00:00Z',
    durationMinutes: 90,
    departments: ['ENGINEERING'],
    taskIds: ['TSK-ENG-008'],
    requestIds: ['REQ-017'],
    status: 'REJECTED',
    constraintValidation: {
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
    source: 'MANUAL',
  },

  // ==========================================
  // 7. AI-PROPOSED BLOCK (Future multi-department bundle: Scenario 8)
  // ==========================================
  {
    blockId: 'BLK-INT-007',
    date: '2026-10-04',
    sectionId: 'SEC-KCG-DR',
    fromStation: 'KACHEGUDA',
    toStation: 'DR-JUNCTION',
    startTime: '2026-10-04T02:00:00Z',
    endTime: '2026-10-04T03:15:00Z',
    durationMinutes: 75,
    departments: ['SNT', 'TRACTION'],
    taskIds: ['TSK-SNT-006', 'TSK-TRC-007'],
    requestIds: ['REQ-015', 'REQ-016'],
    status: 'AI_PROPOSED',
    constraintValidation: {
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
    source: 'AI_RECOMMENDED',
  },

  // ==========================================
  // 8. PUBLISHED BLOCK (Final master block for 2026-09-25)
  // ==========================================
  {
    blockId: 'BLK-INT-008',
    date: '2026-09-25',
    sectionId: 'SEC-SCD-KCG',
    fromStation: 'SECUNDERABAD',
    toStation: 'KACHEGUDA',
    startTime: '2026-09-25T02:00:00Z',
    endTime: '2026-09-25T03:45:00Z',
    durationMinutes: 105,
    departments: ['ENGINEERING', 'SNT', 'TRACTION'],
    taskIds: ['TSK-ENG-001', 'TSK-SNT-001', 'TSK-TRC-001'],
    requestIds: ['REQ-001', 'REQ-002', 'REQ-003'],
    status: 'PUBLISHED',
    constraintValidation: {
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
    source: 'OPTIMIZER_GENERATED',
  },
];
