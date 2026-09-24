import { Train } from '../types/train';

/**
 * RailOpt Synthetic Demo Data: Scheduled Trains Timetable
 * Division: SECUNDERABAD (SEC)
 * 
 * 20 fictional train services across PASSENGER, EXPRESS, and GOODS categories.
 * Timetable designed to simulate realistic track conflicts with maintenance requests.
 */
export const mockTrains: Train[] = [
  // ==========================================
  // SEC-SCD-KCG SECTION
  // ==========================================
  {
    trainId: 'TRN-001',
    trainNumber: 'D001',
    trainType: 'EXPRESS',
    sectionId: 'SEC-SCD-KCG',
    direction: 'UP',
    arrivalTime: '2026-09-25T00:30:00Z',
    departureTime: '2026-09-25T01:10:00Z',
    operationalPriority: 90,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-002',
    trainNumber: 'D002',
    trainType: 'PASSENGER',
    sectionId: 'SEC-SCD-KCG',
    direction: 'DOWN',
    arrivalTime: '2026-09-25T04:15:00Z',
    departureTime: '2026-09-25T05:00:00Z',
    operationalPriority: 75,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-003',
    trainNumber: 'D003',
    trainType: 'EXPRESS',
    sectionId: 'SEC-SCD-KCG',
    direction: 'UP',
    arrivalTime: '2026-09-25T06:00:00Z',
    departureTime: '2026-09-25T06:45:00Z',
    operationalPriority: 95,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-004',
    trainNumber: 'G103',
    trainType: 'GOODS',
    sectionId: 'SEC-SCD-KCG',
    direction: 'DOWN',
    arrivalTime: '2026-09-25T13:30:00Z',
    departureTime: '2026-09-25T14:30:00Z',
    operationalPriority: 40,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-005',
    trainNumber: 'D011',
    trainType: 'EXPRESS',
    sectionId: 'SEC-SCD-KCG',
    direction: 'UP',
    arrivalTime: '2026-09-25T15:00:00Z',
    departureTime: '2026-09-25T15:45:00Z',
    operationalPriority: 90,
    status: 'SCHEDULED',
  },

  // ==========================================
  // SEC-LPI-MBNR SECTION
  // ==========================================
  {
    trainId: 'TRN-006',
    trainNumber: 'D004',
    trainType: 'PASSENGER',
    sectionId: 'SEC-LPI-MBNR',
    direction: 'UP',
    arrivalTime: '2026-09-25T00:45:00Z',
    departureTime: '2026-09-25T01:30:00Z',
    operationalPriority: 70,
    status: 'SCHEDULED',
  },
  {
    // Crucial for Scenario 2: Passenger Train Conflict with Block Request REQ-004
    trainId: 'TRN-007',
    trainNumber: 'D005',
    trainType: 'EXPRESS',
    sectionId: 'SEC-LPI-MBNR',
    direction: 'DOWN',
    arrivalTime: '2026-09-25T02:15:00Z',
    departureTime: '2026-09-25T02:50:00Z',
    operationalPriority: 95,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-008',
    trainNumber: 'D006',
    trainType: 'PASSENGER',
    sectionId: 'SEC-LPI-MBNR',
    direction: 'UP',
    arrivalTime: '2026-09-25T04:00:00Z',
    departureTime: '2026-09-25T04:45:00Z',
    operationalPriority: 70,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-009',
    trainNumber: 'G104',
    trainType: 'GOODS',
    sectionId: 'SEC-LPI-MBNR',
    direction: 'UP',
    arrivalTime: '2026-09-25T16:00:00Z',
    departureTime: '2026-09-25T17:15:00Z',
    operationalPriority: 45,
    status: 'SCHEDULED',
  },

  // ==========================================
  // SEC-BMT-FM SECTION
  // ==========================================
  {
    trainId: 'TRN-010',
    trainNumber: 'D007',
    trainType: 'PASSENGER',
    sectionId: 'SEC-BMT-FM',
    direction: 'UP',
    arrivalTime: '2026-09-25T00:15:00Z',
    departureTime: '2026-09-25T01:00:00Z',
    operationalPriority: 65,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-011',
    trainNumber: 'D008',
    trainType: 'PASSENGER',
    sectionId: 'SEC-BMT-FM',
    direction: 'DOWN',
    arrivalTime: '2026-09-25T04:30:00Z',
    departureTime: '2026-09-25T05:15:00Z',
    operationalPriority: 65,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-012',
    trainNumber: 'D014',
    trainType: 'PASSENGER',
    sectionId: 'SEC-BMT-FM',
    direction: 'UP',
    arrivalTime: '2026-09-25T11:00:00Z',
    departureTime: '2026-09-25T11:45:00Z',
    operationalPriority: 70,
    status: 'SCHEDULED',
  },

  // ==========================================
  // SEC-KCG-DR SECTION
  // ==========================================
  {
    trainId: 'TRN-013',
    trainNumber: 'G101',
    trainType: 'GOODS',
    sectionId: 'SEC-KCG-DR',
    direction: 'UP',
    arrivalTime: '2026-09-25T01:15:00Z',
    departureTime: '2026-09-25T02:15:00Z',
    operationalPriority: 45,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-014',
    trainNumber: 'G102',
    trainType: 'GOODS',
    sectionId: 'SEC-KCG-DR',
    direction: 'DOWN',
    arrivalTime: '2026-09-25T03:45:00Z',
    departureTime: '2026-09-25T04:45:00Z',
    operationalPriority: 45,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-015',
    trainNumber: 'D012',
    trainType: 'PASSENGER',
    sectionId: 'SEC-KCG-DR',
    direction: 'UP',
    arrivalTime: '2026-09-25T07:00:00Z',
    departureTime: '2026-09-25T08:15:00Z',
    operationalPriority: 75,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-016',
    trainNumber: 'D013',
    trainType: 'EXPRESS',
    sectionId: 'SEC-KCG-DR',
    direction: 'DOWN',
    arrivalTime: '2026-09-25T09:30:00Z',
    departureTime: '2026-09-25T10:45:00Z',
    operationalPriority: 90,
    status: 'SCHEDULED',
  },

  // ==========================================
  // SEC-LPI-HYB SECTION
  // ==========================================
  {
    trainId: 'TRN-017',
    trainNumber: 'D009',
    trainType: 'EXPRESS',
    sectionId: 'SEC-LPI-HYB',
    direction: 'UP',
    arrivalTime: '2026-09-25T03:00:00Z',
    departureTime: '2026-09-25T03:40:00Z',
    operationalPriority: 85,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-018',
    trainNumber: 'D010',
    trainType: 'PASSENGER',
    sectionId: 'SEC-LPI-HYB',
    direction: 'DOWN',
    arrivalTime: '2026-09-25T05:00:00Z',
    departureTime: '2026-09-25T05:35:00Z',
    operationalPriority: 70,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-019',
    trainNumber: 'G105',
    trainType: 'GOODS',
    sectionId: 'SEC-LPI-HYB',
    direction: 'DOWN',
    arrivalTime: '2026-09-25T14:00:00Z',
    departureTime: '2026-09-25T15:00:00Z',
    operationalPriority: 40,
    status: 'SCHEDULED',
  },
  {
    trainId: 'TRN-020',
    trainNumber: 'D015',
    trainType: 'EXPRESS',
    sectionId: 'SEC-LPI-HYB',
    direction: 'UP',
    arrivalTime: '2026-09-25T18:30:00Z',
    departureTime: '2026-09-25T19:15:00Z',
    operationalPriority: 95,
    status: 'SCHEDULED',
  },
];
