import { BlockRequest } from '../types/block';

/**
 * RailOpt Synthetic Demo Data: Divisional Block Requests
 * Division: SECUNDERABAD (SEC)
 * 
 * 18 block requests submitted by branch officers across ENGINEERING, SNT, and TRACTION.
 * Maps 1-to-1 to corresponding MaintenanceTasks.
 * 
 * Demonstrates multiple operational statuses:
 * - APPROVED & SCHEDULED: Validated candidates slated for execution
 * - CONFLICT: Triggered by train traffic, crew clashes, or corridor saturation
 * - INTEGRATION_CANDIDATE: Grouped for multi-department corridor bundling
 * - ANALYZING & PENDING: Newly submitted work awaiting conflict check
 * - REJECTED & COMPLETED: Historical and boundary condition records
 */
export const mockBlockRequests: BlockRequest[] = [
  // ==========================================
  // CANDIDATES FOR 3-DEPARTMENT JOINT BLOCK (Scenario 1)
  // ==========================================
  {
    requestId: 'REQ-001',
    taskId: 'TSK-ENG-001',
    department: 'ENGINEERING',
    sectionId: 'SEC-SCD-KCG',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T02:00:00Z',
    preferredEnd: '2026-09-25T03:30:00Z',
    durationMinutes: 90,
    blockType: 'CORRIDOR',
    priority: 1, // Emergency fracture weld
    status: 'APPROVED',
    submittedAt: '2026-09-24T06:30:00Z',
  },
  {
    requestId: 'REQ-002',
    taskId: 'TSK-SNT-001',
    department: 'SNT',
    sectionId: 'SEC-SCD-KCG',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T02:30:00Z',
    preferredEnd: '2026-09-25T03:15:00Z',
    durationMinutes: 45,
    blockType: 'SHADOW',
    priority: 2,
    status: 'APPROVED',
    submittedAt: '2026-09-24T07:15:00Z',
  },
  {
    requestId: 'REQ-003',
    taskId: 'TSK-TRC-001',
    department: 'TRACTION',
    sectionId: 'SEC-SCD-KCG',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T02:15:00Z',
    preferredEnd: '2026-09-25T03:15:00Z',
    durationMinutes: 60,
    blockType: 'SHADOW',
    priority: 2,
    status: 'APPROVED',
    submittedAt: '2026-09-24T07:45:00Z',
  },

  // ==========================================
  // CONFLICT CASES (Scenarios 2, 3, 5, 6)
  // ==========================================
  {
    // Scenario 2: Clashes with Express Train D005
    requestId: 'REQ-004',
    taskId: 'TSK-ENG-002',
    department: 'ENGINEERING',
    sectionId: 'SEC-LPI-MBNR',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T02:00:00Z',
    preferredEnd: '2026-09-25T03:30:00Z',
    durationMinutes: 90,
    blockType: 'CORRIDOR',
    priority: 3,
    status: 'CONFLICT',
    submittedAt: '2026-09-24T08:00:00Z',
  },
  {
    // Scenarios 3 & 6: Clashes with Goods Forecast GFC-001 and Corridor 60m limit
    requestId: 'REQ-005',
    taskId: 'TSK-ENG-003',
    department: 'ENGINEERING',
    sectionId: 'SEC-KCG-DR',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T02:30:00Z',
    preferredEnd: '2026-09-25T04:00:00Z',
    durationMinutes: 90,
    blockType: 'EMERGENCY',
    priority: 1,
    status: 'CONFLICT',
    submittedAt: '2026-09-24T08:15:00Z',
  },
  {
    // Scenario 5: Contends with REQ-002 for specialized Signal Squad RES-SNT-001
    requestId: 'REQ-006',
    taskId: 'TSK-SNT-002',
    department: 'SNT',
    sectionId: 'SEC-SCD-KCG',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T02:00:00Z',
    preferredEnd: '2026-09-25T02:50:00Z',
    durationMinutes: 50,
    blockType: 'SHADOW',
    priority: 4,
    status: 'CONFLICT',
    submittedAt: '2026-09-24T08:30:00Z',
  },

  // ==========================================
  // ENG + S&T INTEGRATED CANDIDATES (Scenario 7)
  // ==========================================
  {
    requestId: 'REQ-007',
    taskId: 'TSK-ENG-004',
    department: 'ENGINEERING',
    sectionId: 'SEC-LPI-MBNR',
    requestedDate: '2026-09-25',
    preferredStart: '2026-09-27T02:00:00Z',
    preferredEnd: '2026-09-27T03:15:00Z',
    durationMinutes: 75,
    blockType: 'CORRIDOR',
    priority: 3,
    status: 'SCHEDULED',
    submittedAt: '2026-09-24T09:00:00Z',
  },
  {
    requestId: 'REQ-008',
    taskId: 'TSK-SNT-004',
    department: 'SNT',
    sectionId: 'SEC-LPI-MBNR',
    requestedDate: '2026-09-25',
    preferredStart: '2026-09-27T02:15:00Z',
    preferredEnd: '2026-09-27T03:00:00Z',
    durationMinutes: 45,
    blockType: 'SHADOW',
    priority: 3,
    status: 'SCHEDULED',
    submittedAt: '2026-09-24T09:15:00Z',
  },

  // ==========================================
  // ENG + TRACTION INTEGRATED CANDIDATES (Scenario 7)
  // ==========================================
  {
    requestId: 'REQ-009',
    taskId: 'TSK-ENG-006',
    department: 'ENGINEERING',
    sectionId: 'SEC-BMT-FM',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T02:00:00Z',
    preferredEnd: '2026-09-25T03:00:00Z',
    durationMinutes: 60,
    blockType: 'CORRIDOR',
    priority: 4,
    status: 'SCHEDULED',
    submittedAt: '2026-09-24T09:30:00Z',
  },
  {
    requestId: 'REQ-010',
    taskId: 'TSK-TRC-006',
    department: 'TRACTION',
    sectionId: 'SEC-BMT-FM',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T02:15:00Z',
    preferredEnd: '2026-09-25T03:00:00Z',
    durationMinutes: 45,
    blockType: 'SHADOW',
    priority: 4,
    status: 'SCHEDULED',
    submittedAt: '2026-09-24T09:45:00Z',
  },

  // ==========================================
  // OTHER WORKFLOW STATUSES & HORIZONS
  // ==========================================
  {
    requestId: 'REQ-011',
    taskId: 'TSK-TRC-002',
    department: 'TRACTION',
    sectionId: 'SEC-SCD-KCG',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T03:30:00Z',
    preferredEnd: '2026-09-25T04:15:00Z',
    durationMinutes: 45,
    blockType: 'ROUTINE',
    priority: 5,
    status: 'INTEGRATION_CANDIDATE',
    submittedAt: '2026-09-24T10:00:00Z',
  },
  {
    requestId: 'REQ-012',
    taskId: 'TSK-SNT-003',
    department: 'SNT',
    sectionId: 'SEC-SCD-KCG',
    requestedDate: '2026-09-25',
    preferredStart: '2026-09-25T03:15:00Z',
    preferredEnd: '2026-09-25T04:00:00Z',
    durationMinutes: 45,
    blockType: 'SHADOW',
    priority: 3,
    status: 'ANALYZING',
    submittedAt: '2026-09-24T10:15:00Z',
  },
  {
    requestId: 'REQ-013',
    taskId: 'TSK-ENG-005',
    department: 'ENGINEERING',
    sectionId: 'SEC-SCD-KCG',
    requestedDate: '2026-09-25',
    preferredStart: '2026-09-28T02:00:00Z',
    preferredEnd: '2026-09-28T03:30:00Z',
    durationMinutes: 90,
    blockType: 'CORRIDOR',
    priority: 3,
    status: 'PENDING',
    submittedAt: '2026-09-24T10:30:00Z',
  },
  {
    requestId: 'REQ-014',
    taskId: 'TSK-TRC-003',
    department: 'TRACTION',
    sectionId: 'SEC-LPI-MBNR',
    requestedDate: '2026-09-24',
    preferredStart: '2026-09-25T14:00:00Z',
    preferredEnd: '2026-09-25T16:00:00Z',
    durationMinutes: 120,
    blockType: 'CORRIDOR',
    priority: 4,
    status: 'PENDING',
    submittedAt: '2026-09-24T10:45:00Z',
  },
  {
    requestId: 'REQ-015',
    taskId: 'TSK-SNT-006',
    department: 'SNT',
    sectionId: 'SEC-KCG-DR',
    requestedDate: '2026-09-24',
    preferredStart: '2026-10-04T02:00:00Z',
    preferredEnd: '2026-10-04T03:00:00Z',
    durationMinutes: 60,
    blockType: 'EMERGENCY',
    priority: 1,
    status: 'INTEGRATION_CANDIDATE',
    submittedAt: '2026-09-24T11:00:00Z',
  },
  {
    requestId: 'REQ-016',
    taskId: 'TSK-TRC-007',
    department: 'TRACTION',
    sectionId: 'SEC-KCG-DR',
    requestedDate: '2026-09-24',
    preferredStart: '2026-10-04T02:15:00Z',
    preferredEnd: '2026-10-04T03:15:00Z',
    durationMinutes: 60,
    blockType: 'SHADOW',
    priority: 2,
    status: 'INTEGRATION_CANDIDATE',
    submittedAt: '2026-09-24T11:15:00Z',
  },
  {
    requestId: 'REQ-017',
    taskId: 'TSK-ENG-008',
    department: 'ENGINEERING',
    sectionId: 'SEC-LPI-HYB',
    requestedDate: '2026-09-24',
    preferredStart: '2026-10-12T01:30:00Z',
    preferredEnd: '2026-10-12T03:00:00Z',
    durationMinutes: 90,
    blockType: 'ROUTINE',
    priority: 5,
    status: 'REJECTED',
    submittedAt: '2026-09-24T11:30:00Z',
  },
  {
    requestId: 'REQ-018',
    taskId: 'TSK-SNT-008',
    department: 'SNT',
    sectionId: 'SEC-LPI-HYB',
    requestedDate: '2026-09-23',
    preferredStart: '2026-09-24T01:30:00Z',
    preferredEnd: '2026-09-24T02:30:00Z',
    durationMinutes: 60,
    blockType: 'ROUTINE',
    priority: 5,
    status: 'COMPLETED',
    submittedAt: '2026-09-23T14:00:00Z',
  },
];
