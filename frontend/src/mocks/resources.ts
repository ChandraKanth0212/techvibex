import { Resource } from '../types/resource';

/**
 * RailOpt Synthetic Demo Data: Maintenance Resources
 * Division: SECUNDERABAD (SEC)
 * 
 * 13 resources covering heavy track machinery, specialized crews, inspection units, and road-rail vehicles.
 * Includes intentional crew overbooking constraints for demo Scenario 5.
 */
export const mockResources: Resource[] = [
  // ==========================================
  // ENGINEERING RESOURCES (5)
  // ==========================================
  {
    resourceId: 'RES-ENG-001',
    department: 'ENGINEERING',
    resourceType: 'TRACK_MACHINE',
    name: 'CSM 08-32 Continuous Action Track Tamping Machine',
    availabilityWindows: [
      { windowId: 'RAW-001', start: '2026-09-25T01:30:00Z', end: '2026-09-25T04:30:00Z', isAvailable: true },
      { windowId: 'RAW-002', start: '2026-09-25T11:00:00Z', end: '2026-09-25T14:00:00Z', isAvailable: true },
      { windowId: 'RAW-003', start: '2026-09-26T01:30:00Z', end: '2026-09-26T04:30:00Z', isAvailable: true },
    ],
    currentLocation: 'SECUNDERABAD Yard Siding 4',
    status: 'AVAILABLE',
  },
  {
    resourceId: 'RES-ENG-002',
    department: 'ENGINEERING',
    resourceType: 'MAINTENANCE_CREW',
    name: 'Permanent Way Maintenance Gang P-WAY-SEC-01',
    availabilityWindows: [
      { windowId: 'RAW-004', start: '2026-09-25T01:00:00Z', end: '2026-09-25T05:00:00Z', isAvailable: false }, // Allocated to TSK-ENG-001
      { windowId: 'RAW-005', start: '2026-09-25T13:00:00Z', end: '2026-09-25T17:00:00Z', isAvailable: true },
    ],
    currentLocation: 'SECUNDERABAD Depot',
    status: 'ALLOCATED',
  },
  {
    resourceId: 'RES-ENG-003',
    department: 'ENGINEERING',
    resourceType: 'VEHICLE',
    name: 'Mobile Flash Butt Welding Road-Rail Vehicle (RRV-02)',
    availabilityWindows: [
      { windowId: 'RAW-006', start: '2026-09-25T01:30:00Z', end: '2026-09-25T05:30:00Z', isAvailable: true },
      { windowId: 'RAW-007', start: '2026-09-25T14:00:00Z', end: '2026-09-25T18:00:00Z', isAvailable: true },
    ],
    currentLocation: 'LINGAMPALLI Depot',
    status: 'AVAILABLE',
  },
  {
    resourceId: 'RES-ENG-004',
    department: 'ENGINEERING',
    resourceType: 'INSPECTION_TEAM',
    name: 'Bridge Structural Ultrasonic Testing Squad BSU-01',
    availabilityWindows: [
      { windowId: 'RAW-008', start: '2026-09-25T01:00:00Z', end: '2026-09-25T04:30:00Z', isAvailable: true },
      { windowId: 'RAW-009', start: '2026-09-25T09:00:00Z', end: '2026-09-25T13:00:00Z', isAvailable: true },
    ],
    currentLocation: 'KACHEGUDA Base',
    status: 'AVAILABLE',
  },
  {
    resourceId: 'RES-ENG-005',
    department: 'ENGINEERING',
    resourceType: 'MAINTENANCE_CREW',
    name: 'Track Maintenance Gang P-WAY-LPI-04',
    availabilityWindows: [
      { windowId: 'RAW-010', start: '2026-09-25T01:00:00Z', end: '2026-09-25T05:00:00Z', isAvailable: true },
      { windowId: 'RAW-011', start: '2026-09-26T01:00:00Z', end: '2026-09-26T05:00:00Z', isAvailable: true },
    ],
    currentLocation: 'LINGAMPALLI Depot',
    status: 'AVAILABLE',
  },

  // ==========================================
  // SNT RESOURCES (4)
  // ==========================================
  {
    resourceId: 'RES-SNT-001',
    department: 'SNT',
    resourceType: 'SIGNAL_CREW',
    name: 'Specialized Point Machine & Interlocking Squad SIG-CREW-01',
    availabilityWindows: [
      // Crucial for Scenario 5: Booked for TSK-SNT-001 02:30-03:30, conflicting with TSK-SNT-002
      { windowId: 'RAW-012', start: '2026-09-25T02:00:00Z', end: '2026-09-25T04:00:00Z', isAvailable: false },
      { windowId: 'RAW-013', start: '2026-09-25T10:00:00Z', end: '2026-09-25T13:00:00Z', isAvailable: true },
    ],
    currentLocation: 'SECUNDERABAD S&T Lab',
    status: 'ALLOCATED',
  },
  {
    resourceId: 'RES-SNT-002',
    department: 'SNT',
    resourceType: 'SIGNAL_CREW',
    name: 'Electronic Interlocking Maintenance Squad SIG-CREW-02',
    availabilityWindows: [
      { windowId: 'RAW-014', start: '2026-09-25T01:00:00Z', end: '2026-09-25T05:00:00Z', isAvailable: true },
      { windowId: 'RAW-015', start: '2026-09-26T01:00:00Z', end: '2026-09-26T05:00:00Z', isAvailable: true },
    ],
    currentLocation: 'LINGAMPALLI S&T Base',
    status: 'AVAILABLE',
  },
  {
    resourceId: 'RES-SNT-003',
    department: 'SNT',
    resourceType: 'VEHICLE',
    name: 'Telecom OFC Fiber Fusion Splicing Emergency Van (TVAN-01)',
    availabilityWindows: [
      { windowId: 'RAW-016', start: '2026-09-25T00:00:00Z', end: '2026-09-25T23:59:59Z', isAvailable: true },
    ],
    currentLocation: 'BEGUMPET Station',
    status: 'AVAILABLE',
  },
  {
    resourceId: 'RES-SNT-004',
    department: 'SNT',
    resourceType: 'INSPECTION_TEAM',
    name: 'Digital Axle Counter High-Precision Calibration Unit ACT-01',
    availabilityWindows: [
      { windowId: 'RAW-017', start: '2026-09-25T01:30:00Z', end: '2026-09-25T05:00:00Z', isAvailable: true },
      { windowId: 'RAW-018', start: '2026-09-26T01:30:00Z', end: '2026-09-26T05:00:00Z', isAvailable: true },
    ],
    currentLocation: 'KACHEGUDA Station',
    status: 'AVAILABLE',
  },

  // ==========================================
  // TRACTION RESOURCES (4)
  // ==========================================
  {
    resourceId: 'RES-TRC-001',
    department: 'TRACTION',
    resourceType: 'OHE_CREW',
    name: 'Self-Propelled 8-Wheeler OHE Tower Wagon Gang (TW-01)',
    availabilityWindows: [
      { windowId: 'RAW-019', start: '2026-09-25T01:30:00Z', end: '2026-09-25T04:30:00Z', isAvailable: false }, // Allocated to TSK-TRC-001
      { windowId: 'RAW-020', start: '2026-09-25T12:00:00Z', end: '2026-09-25T15:00:00Z', isAvailable: true },
    ],
    currentLocation: 'SECUNDERABAD OHE Depot',
    status: 'ALLOCATED',
  },
  {
    resourceId: 'RES-TRC-002',
    department: 'TRACTION',
    resourceType: 'OHE_CREW',
    name: 'Traction Line Electrification Maintenance Gang TRC-02',
    availabilityWindows: [
      { windowId: 'RAW-021', start: '2026-09-25T01:00:00Z', end: '2026-09-25T05:00:00Z', isAvailable: true },
      { windowId: 'RAW-022', start: '2026-09-26T01:00:00Z', end: '2026-09-26T05:00:00Z', isAvailable: true },
    ],
    currentLocation: 'LINGAMPALLI TRD Depot',
    status: 'AVAILABLE',
  },
  {
    resourceId: 'RES-TRC-003',
    department: 'TRACTION',
    resourceType: 'VEHICLE',
    name: 'Automated Contact Wire Wear Measurement Car (WIC-03)',
    availabilityWindows: [
      { windowId: 'RAW-023', start: '2026-09-25T01:00:00Z', end: '2026-09-25T05:00:00Z', isAvailable: true },
    ],
    currentLocation: 'SECUNDERABAD Yard',
    status: 'AVAILABLE',
  },
  {
    resourceId: 'RES-TRC-004',
    department: 'TRACTION',
    resourceType: 'MAINTENANCE_CREW',
    name: 'Substation Transformer & Isolator Overhaul Squad SOT-01',
    availabilityWindows: [
      { windowId: 'RAW-024', start: '2026-09-25T01:30:00Z', end: '2026-09-25T05:00:00Z', isAvailable: true },
      { windowId: 'RAW-025', start: '2026-09-25T11:00:00Z', end: '2026-09-25T14:00:00Z', isAvailable: true },
    ],
    currentLocation: 'KACHEGUDA TSS',
    status: 'AVAILABLE',
  },
];
