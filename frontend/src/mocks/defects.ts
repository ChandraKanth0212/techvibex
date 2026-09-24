import { Defect } from '../types/defect';

/**
 * RailOpt Synthetic Demo Data: Defects
 * Division: SECUNDERABAD (SEC)
 * 
 * 12 defects distributed across severity levels:
 * - 2 Critical
 * - 4 High
 * - 4 Medium
 * - 2 Low
 * 
 * Linked to valid infrastructure asset IDs.
 */
export const mockDefects: Defect[] = [
  // ==========================================
  // CRITICAL DEFECTS (2)
  // ==========================================
  {
    defectId: 'DEF-001',
    assetId: 'AST-ENG-001',
    department: 'ENGINEERING',
    description: 'Deep transverse fatigue weld fracture detected on rail table at Km 12/6 UP Line curve.',
    severity: 'CRITICAL',
    detectedDate: '2026-09-10T04:15:00Z',
    safetyImpact: 'Severe derailment risk on high-speed passenger corridor; emergency speed restriction of 20 km/h clamped.',
    failureRisk: 'VERY_HIGH',
    status: 'SCHEDULED',
  },
  {
    defectId: 'DEF-002',
    assetId: 'AST-SNT-007',
    department: 'SNT',
    description: 'Intermittent false track occupancy indication on Axle Counter DAC-18 during high temperatures.',
    severity: 'CRITICAL',
    detectedDate: '2026-09-12T11:45:00Z',
    safetyImpact: 'Automated signal clamping to DANGER aspect causing repeated freight train hold-ups.',
    failureRisk: 'VERY_HIGH',
    status: 'OPEN',
  },

  // ==========================================
  // HIGH SEVERITY DEFECTS (4)
  // ==========================================
  {
    defectId: 'DEF-003',
    assetId: 'AST-ENG-002',
    department: 'ENGINEERING',
    description: 'Switch rail tongue wear exceeding 4.5mm safety threshold on Turnout 102A SCD Yard.',
    severity: 'HIGH',
    detectedDate: '2026-09-15T08:20:00Z',
    safetyImpact: 'Risk of wheel flange climbing during yard crossover movement under heavy axle load.',
    failureRisk: 'HIGH',
    status: 'SCHEDULED',
  },
  {
    defectId: 'DEF-004',
    assetId: 'AST-SNT-002',
    department: 'SNT',
    description: 'Point machine PM-102A operating stroke time degraded to 5.4 seconds with motor friction spike.',
    severity: 'HIGH',
    detectedDate: '2026-09-16T14:10:00Z',
    safetyImpact: 'Route setting timeout triggering signal revocation and route interlocking safety lockouts.',
    failureRisk: 'HIGH',
    status: 'SCHEDULED',
  },
  {
    defectId: 'DEF-005',
    assetId: 'AST-TRC-001',
    department: 'TRACTION',
    description: 'Contact wire diameter worn down to 9.2mm (cross-sectional loss >24%) at Km 12/4.',
    severity: 'HIGH',
    detectedDate: '2026-09-17T06:30:00Z',
    safetyImpact: 'High risk of OHE wire snapping under pantograph dynamic pressure at 110 km/h.',
    failureRisk: 'HIGH',
    status: 'SCHEDULED',
  },
  {
    defectId: 'DEF-006',
    assetId: 'AST-TRC-003',
    department: 'TRACTION',
    description: 'Feeder bay F-1 bushing insulator surface flashover tracking marks detected at KCG TSS.',
    severity: 'HIGH',
    detectedDate: '2026-09-18T16:00:00Z',
    safetyImpact: 'Potential total 25kV traction substation trip cutting motive power to Secunderabad node.',
    failureRisk: 'HIGH',
    status: 'OPEN',
  },

  // ==========================================
  // MEDIUM SEVERITY DEFECTS (4)
  // ==========================================
  {
    defectId: 'DEF-007',
    assetId: 'AST-ENG-005',
    department: 'ENGINEERING',
    description: 'Check rail clearance deviation (41mm vs 44mm nominal) on Turnout 21B LPI Yard.',
    severity: 'MEDIUM',
    detectedDate: '2026-09-19T09:40:00Z',
    safetyImpact: 'Increased lateral flange impact on crossing nose causing accelerated structural wear.',
    failureRisk: 'MEDIUM',
    status: 'SCHEDULED',
  },
  {
    defectId: 'DEF-008',
    assetId: 'AST-SNT-001',
    department: 'SNT',
    description: 'Signal S-12 Yellow aspect LED cluster intensity degraded below 70% photometric limit.',
    severity: 'MEDIUM',
    detectedDate: '2026-09-20T10:15:00Z',
    safetyImpact: 'Sub-optimal sighting distance for loco pilots during fog or high glare sunlight.',
    failureRisk: 'MEDIUM',
    status: 'SCHEDULED',
  },
  {
    defectId: 'DEF-009',
    assetId: 'AST-TRC-004',
    department: 'TRACTION',
    description: 'ATD weight counterpoise bottom clearance reduced to 150mm due to summer thermal expansion.',
    severity: 'MEDIUM',
    detectedDate: '2026-09-21T13:25:00Z',
    safetyImpact: 'Counterweight grounding risk which would cause loss of catenary tension regulation.',
    failureRisk: 'MEDIUM',
    status: 'OPEN',
  },
  {
    defectId: 'DEF-010',
    assetId: 'AST-ENG-006',
    department: 'ENGINEERING',
    description: 'Localized ballast pocket deficiency and 8mm cross-level twist at Km 8/2.',
    severity: 'MEDIUM',
    detectedDate: '2026-09-22T07:50:00Z',
    safetyImpact: 'Ride index degradation; temporary caution order required if untreated.',
    failureRisk: 'MEDIUM',
    status: 'UNDER_INVESTIGATION',
  },

  // ==========================================
  // LOW SEVERITY DEFECTS (2)
  // ==========================================
  {
    defectId: 'DEF-011',
    assetId: 'AST-SNT-006',
    department: 'SNT',
    description: 'Minor insulation resistance drop on point detection circuit cable sheath at PM-14.',
    severity: 'LOW',
    detectedDate: '2026-09-23T11:00:00Z',
    safetyImpact: 'Preventative replacement needed before monsoon moisture ingress.',
    failureRisk: 'LOW',
    status: 'RESOLVED',
  },
  {
    defectId: 'DEF-012',
    assetId: 'AST-TRC-002',
    department: 'TRACTION',
    description: 'Mild oxidation layer on manual isolator copper contact blades ISO-12.',
    severity: 'LOW',
    detectedDate: '2026-09-23T15:30:00Z',
    safetyImpact: 'Contact resistance within permissible tolerances; lubrication scheduled during next block.',
    failureRisk: 'LOW',
    status: 'CLOSED',
  },
];
