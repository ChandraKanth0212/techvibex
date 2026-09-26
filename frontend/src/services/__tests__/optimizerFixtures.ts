/**
 * Test fixtures shaped exactly like Module 3 wire responses
 * (`optimizer/app/schemas/api.py`). Used by the client, service and adapter
 * tests so all three assert against the same contract.
 */

import type {
  CandidateDTO,
  IntegratedBlockDTO,
  PlanResponse,
  ScheduleDTO,
  SelectedBlockDTO,
  UnscheduledTaskDTO,
  ValidationDTO,
  ViolationDTO,
} from '@/types/optimizer';

export const BLOCK: SelectedBlockDTO = {
  block_id: 'BLK-0001',
  task_ids: ['TASK-001', 'TASK-002'],
  request_ids: ['REQ-0001'],
  corridor_id: 'CORR-SEC-01',
  section: 'SEC-HYB',
  start_time: '2026-01-05T08:00:00',
  end_time: '2026-01-05T10:30:00',
  duration_minutes: 150,
  integrated: true,
  participating_departments: ['ENGINEERING', 'SNT'],
  resources: ['RES-01', 'RES-02'],
  status: 'SCHEDULED',
  block_type: 'INTEGRATED',
};

export const SINGLE_BLOCK: SelectedBlockDTO = {
  ...BLOCK,
  block_id: 'BLK-0002',
  task_ids: ['TASK-003'],
  integrated: false,
  block_type: 'SINGLE',
};

export const UNSCHEDULED_TASK: UnscheduledTaskDTO = {
  task_id: 'TASK-004',
  scheduled: false,
  reason: 'no feasible candidate',
  candidate_count: 2,
  feasible_candidate_count: 0,
  rejection_codes: ['TRAIN_MOVEMENT_CONFLICT'],
  metadata: { source: 'SYNTHETIC_DEMO' },
};

export const ERROR_VIOLATION: ViolationDTO = {
  code: 'TASK_WINDOW_VIOLATION',
  severity: 'ERROR',
  message: 'task window violated',
  affected_ids: ['BLK-0001'],
  reason: 'block starts before the requested window',
};

export const WARNING_VIOLATION: ViolationDTO = {
  code: 'GOODS_FORECAST_ELEVATED',
  severity: 'WARNING',
  message: 'goods traffic elevated',
  affected_ids: ['TASK-001'],
  reason: 'probability above threshold',
};

export const SCHEDULE: ScheduleDTO = {
  schedule_id: 'SCH-0001',
  status: 'OPTIMAL',
  message: 'plan generated',
  objective_value: 0.8734,
  scheduled_task_ids: ['TASK-001', 'TASK-002'],
  unscheduled_task_ids: ['TASK-004'],
  unscheduled_tasks: [UNSCHEDULED_TASK],
  selected_blocks: [BLOCK],
  solver_metadata: { solver: 'test-solver' },
};

export const VALIDATION: ValidationDTO = {
  schedule_id: 'SCH-0001',
  solver_status: 'OPTIMAL',
  valid: false,
  errors: [ERROR_VIOLATION],
  warnings: [WARNING_VIOLATION],
  checked_block_count: 1,
  checked_task_count: 3,
  metadata: { validator: 'independent' },
};

export const PLAN_RESPONSE: PlanResponse = {
  request_id: 'REQ-0001',
  plan_id: 'PLAN-abc123',
  data_mode: 'SYNTHETIC_DEMO',
  solver_status: 'OPTIMAL',
  schedule: SCHEDULE,
  validation: VALIDATION,
  metrics: {
    total_tasks_requested: 3,
    total_tasks_scheduled: 2,
    task_coverage_ratio: 0.6667,
    integrated_blocks_count: 1,
    block_consolidation_ratio: 0.5,
    average_possession_minutes: 150,
    slot_utilisation_percent: 12.5,
    resource_utilisation_percent: 40,
    scheduled_urgent_tasks: 1,
    unscheduled_urgent_tasks: 0,
    conflicts_resolved: 1,
    validation_accuracy_percent: 92.5,
    extra: { model: 'demo' },
  },
  explanations: {
    schedule_id: 'SCH-0001',
    solver_status: 'OPTIMAL',
    schedule_valid: false,
    validation_provided: true,
    records: [
      {
        subject_id: 'TASK-001',
        subject_type: 'TASK',
        status: 'SCHEDULED',
        reason_codes: ['RESOURCES_AVAILABLE'],
        summary: 'scheduled inside the integrated block',
        details: ['corridor available'],
        evidence: { window: '2026-01-05T08:00:00' },
        metadata: {},
      },
    ],
    metadata: {},
  },
  candidates: [
    {
      candidate_id: 'CAND-0001',
      task_ids: ['TASK-001'],
      corridor_id: 'CORR-SEC-01',
      section: 'SEC-HYB',
      start_time: '2026-01-05T08:00:00',
      end_time: '2026-01-05T09:00:00',
      duration_minutes: 60,
      feasible: true,
      rejected: false,
      violations: [],
      metadata: {},
    },
  ],
  integrated_candidates: [
    {
      block_id: 'INT-0001',
      task_ids: ['TASK-001', 'TASK-002'],
      request_ids: ['REQ-0001'],
      corridor_id: 'CORR-SEC-01',
      section: 'SEC-HYB',
      window_start: '2026-01-05T08:00:00',
      window_end: '2026-01-05T10:30:00',
      earliest_feasible_start: '2026-01-05T08:00:00',
      latest_feasible_end: '2026-01-05T10:30:00',
      total_required_duration_minutes: 150,
      participating_departments: ['ENGINEERING', 'SNT'],
      compatibility: 'COMPATIBLE',
      violations: [],
      metadata: {},
    } satisfies IntegratedBlockDTO,
  ],
  meta: { scope_task_ids: ['TASK-001', 'TASK-002', 'TASK-004'] },
  storage: 'IN_MEMORY',
};

export const CANDIDATE: CandidateDTO = PLAN_RESPONSE.candidates[0];

/** Fresh deep copy, so a test can mutate a fixture without affecting others. */
export function clonePlan(): PlanResponse {
  return JSON.parse(JSON.stringify(PLAN_RESPONSE)) as PlanResponse;
}
