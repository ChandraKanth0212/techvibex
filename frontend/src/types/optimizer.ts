/**
 * RailOpt Module 4 <-> Module 3 (Optimization Engine) contract types.
 *
 * TWO DISTINCT LAYERS live in this file and must never be confused:
 *
 *  1. TRANSPORT DTOs (snake_case, section "Transport DTOs") mirror
 *     Module 3 `optimizer/app/schemas/api.py` field-for-field. They are the
 *     exact wire shapes: no renaming, no defaulting, no coercion.
 *
 *  2. VIEW MODELS (camelCase, section "Module 4 view models") are the shapes
 *     produced by `src/adapters/optimizer.ts`. Every field is assigned
 *     explicitly by an adapter; nothing is spread through.
 *
 * Existing Module 4 domain models (`@/types/schedule`, `@/types/block`, ...)
 * are NOT reused as transport DTOs and are NOT populated by these adapters in
 * this phase: the optimizer vocabulary is deliberately different (see
 * `UNRESOLVED_OPTIMIZER_MAPPINGS`).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Transport DTOs (snake_case) — mirrors Module 3 schemas/api.py
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module 3 documents `block_type` as `SINGLE | INTEGRATED`.
 *
 * The wire field stays `string | null` on purpose: Pydantic types it as `str`,
 * so an undocumented value must survive transport untouched. Use
 * {@link OptimizerBlockType} only for narrowed, documented values.
 */
export type OptimizerBlockType = 'SINGLE' | 'INTEGRATED';

/** Module 3 `data_mode` (documented: `SYNTHETIC_DEMO`). */
export type OptimizerDataMode = 'SYNTHETIC_DEMO';

/** Module 3 `storage` (documented: `IN_MEMORY`). */
export type OptimizerStorage = 'IN_MEMORY';

/** Free-form JSON object exactly as Module 3 sends it. */
export type OptimizerMetadata = Record<string, unknown>;

export interface ViolationDTO {
  code: string;
  severity: string;
  message: string;
  affected_ids: string[];
  reason: string;
}

export interface UnscheduledTaskDTO {
  task_id: string;
  scheduled: boolean;
  reason: string;
  candidate_count: number;
  feasible_candidate_count: number;
  rejection_codes: string[];
  metadata: OptimizerMetadata;
}

export interface SelectedBlockDTO {
  block_id: string;
  task_ids: string[];
  request_ids: string[];
  corridor_id: string;
  section: string;
  /** ISO-8601 datetime string (Pydantic `datetime` serialised by FastAPI). */
  start_time: string;
  end_time: string;
  duration_minutes: number;
  integrated: boolean;
  participating_departments: string[];
  resources: string[];
  status: string;
  block_type: string | null;
}

export interface ScheduleDTO {
  schedule_id: string;
  status: string;
  message: string;
  objective_value: number;
  scheduled_task_ids: string[];
  unscheduled_task_ids: string[];
  unscheduled_tasks: UnscheduledTaskDTO[];
  selected_blocks: SelectedBlockDTO[];
  solver_metadata: OptimizerMetadata;
}

export interface ValidationDTO {
  schedule_id: string;
  solver_status: string;
  valid: boolean;
  errors: ViolationDTO[];
  warnings: ViolationDTO[];
  checked_block_count: number;
  checked_task_count: number;
  metadata: OptimizerMetadata;
}

export interface MetricsDTO {
  total_tasks_requested: number;
  total_tasks_scheduled: number;
  task_coverage_ratio: number;
  integrated_blocks_count: number;
  block_consolidation_ratio: number;
  average_possession_minutes: number;
  slot_utilisation_percent: number;
  resource_utilisation_percent: number;
  scheduled_urgent_tasks: number;
  unscheduled_urgent_tasks: number;
  conflicts_resolved: number;
  validation_accuracy_percent: number | null;
  extra: OptimizerMetadata;
}

export interface ExplanationRecordDTO {
  subject_id: string;
  subject_type: string;
  status: string;
  reason_codes: string[];
  summary: string;
  details: string[];
  evidence: OptimizerMetadata;
  metadata: OptimizerMetadata;
}

export interface ExplanationDTO {
  schedule_id: string;
  solver_status: string;
  schedule_valid: boolean | null;
  validation_provided: boolean;
  records: ExplanationRecordDTO[];
  metadata: OptimizerMetadata;
}

export interface CandidateDTO {
  candidate_id: string;
  task_ids: string[];
  corridor_id: string;
  section: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  feasible: boolean;
  rejected: boolean;
  violations: ViolationDTO[];
  metadata: OptimizerMetadata;
}

export interface IntegratedBlockDTO {
  block_id: string;
  task_ids: string[];
  request_ids: string[];
  corridor_id: string;
  section: string;
  window_start: string | null;
  window_end: string | null;
  earliest_feasible_start: string | null;
  latest_feasible_end: string | null;
  total_required_duration_minutes: number;
  participating_departments: string[];
  compatibility: string;
  violations: ViolationDTO[];
  metadata: OptimizerMetadata;
}

export interface PlanResponse {
  request_id: string;
  plan_id: string;
  data_mode: string;
  solver_status: string;
  schedule: ScheduleDTO;
  validation: ValidationDTO | null;
  metrics: MetricsDTO | null;
  explanations: ExplanationDTO | null;
  candidates: CandidateDTO[];
  integrated_candidates: IntegratedBlockDTO[];
  meta: OptimizerMetadata;
  storage: string;
}

export interface CandidatesResponse {
  task_ids: string[];
  candidate_count: number;
  feasible_count: number;
  rejected_count: number;
  rejection_codes: Record<string, number>;
  candidates: CandidateDTO[];
  data_mode: string;
  storage: string;
}

export interface IntegratedBlocksResponse {
  task_ids: string[];
  groups_examined: number;
  compatible_count: number;
  rejection_codes: Record<string, number>;
  candidates: IntegratedBlockDTO[];
  data_mode: string;
  storage: string;
}

export interface ValidationResponse {
  schedule_id: string;
  solver_status: string;
  valid: boolean;
  error_count: number;
  warning_count: number;
  checked_block_count: number;
  checked_task_count: number;
  errors: ViolationDTO[];
  warnings: ViolationDTO[];
  metadata: OptimizerMetadata;
}

export interface PlanMetricsResponse {
  plan_id: string;
  metrics: MetricsDTO;
}

export interface PlanConflictsResponse {
  plan_id: string;
  solver_status: string;
  validation_valid: boolean | null;
  error_count: number;
  warning_count: number;
  errors: ViolationDTO[];
  warnings: ViolationDTO[];
  rejected_candidate_count: number;
  candidate_rejection_codes: Record<string, number>;
}

export interface ErrorDetailDTO {
  code: string;
  message: string;
  details: Record<string, unknown>;
  request_id: string | null;
}

export interface ErrorResponse {
  error: ErrorDetailDTO;
}

/**
 * `GET /health` is the one Module 3 endpoint that is published with camelCase
 * aliases (`app/schemas/health.py`: `status`, `module`, `dataMode`).
 */
export interface HealthResponse {
  status: string;
  module: string;
  dataMode: string;
}

// ── Transport DTOs: request bodies ───────────────────────────────────────────

/**
 * Module 3 `PlanningContext` (`app/core/context.py`).
 *
 * The collection KEYS below are the real contract. The element shapes are owned
 * by Module 3 `contracts/*` and are intentionally left as `unknown` in this
 * phase: building Module 4 -> Module 3 context payloads is a separate concern
 * and must not be invented here.
 */
export interface OptimizerContextDTO {
  horizon_start?: string | null;
  horizon_end?: string | null;
  tasks?: unknown[];
  block_requests?: unknown[];
  corridors?: unknown[];
  existing_blocks?: unknown[];
  train_movements?: unknown[];
  goods_forecasts?: unknown[];
  resources?: unknown[];
  assets?: unknown[];
  defects?: unknown[];
  priorities?: unknown[];
}

export interface ModelObjectiveWeightsDTO {
  slot_consolidation?: number | null;
  priority_adherence?: number | null;
  forecast_alignment?: number | null;
  resource_efficiency?: number | null;
  task_completion?: number | null;
  overdue_reduction?: number | null;
}

export interface ModelSettingsDTO {
  safety_buffer_minutes?: number | null;
  goods_forecast_probability_threshold?: number | null;
  goods_forecast_peak_threshold?: number | null;
  solver_timeout_seconds?: number | null;
  planning_horizon_days?: number | null;
  candidate_step_minutes?: number | null;
  max_candidates_per_task?: number | null;
  max_integrated_group_size?: number | null;
  max_integrated_groups?: number | null;
  max_placements_per_group?: number | null;
  objective_weights?: ModelObjectiveWeightsDTO | null;
}

/** `BlockRequest` element shape is owned by Module 3 `contracts/block_request.py`. */
export type OptimizerBlockRequestPayload = Record<string, unknown>;

export interface OptimizeRequestDTO {
  request?: OptimizerBlockRequestPayload | null;
  context: OptimizerContextDTO;
  settings?: ModelSettingsDTO | null;
}

export interface CandidatesRequestDTO {
  context: OptimizerContextDTO;
  task_ids?: string[] | null;
  settings?: ModelSettingsDTO | null;
}

export interface DiscoverRequestDTO {
  context: OptimizerContextDTO;
  task_ids?: string[] | null;
  settings?: ModelSettingsDTO | null;
}

export interface ValidateRequestDTO {
  schedule: ScheduleDTO;
  context: OptimizerContextDTO;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 3 error codes (documented set; unknown codes stay possible)
// ─────────────────────────────────────────────────────────────────────────────

export type OptimizerErrorCode =
  | 'EMPTY_CONTEXT'
  | 'EMPTY_SCOPE'
  | 'UNKNOWN_TASK_REFERENCED'
  | 'REQUEST_REQUIRED'
  | 'CANDIDATE_GENERATION_FAILED'
  | 'INTEGRATED_BLOCK_DETECTION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'METHOD_NOT_ALLOWED'
  | 'FORBIDDEN'
  | 'REQUEST_VALIDATION'
  | 'INTERNAL_ERROR'
  | 'PLAN_METRICS_UNAVAILABLE'
  | 'PLAN_VALIDATION_UNAVAILABLE'
  // Module 3 falls back to `HTTP_<status>` for unmapped HTTP statuses.
  | (string & {});

// ─────────────────────────────────────────────────────────────────────────────
// Unresolved product decisions — MUST NOT be silently mapped
// ─────────────────────────────────────────────────────────────────────────────

/** Module 4 `BlockType` (`@/types/maintenance`). */
export const MODULE4_BLOCK_TYPES = ['CORRIDOR', 'SHADOW', 'EMERGENCY', 'ROUTINE'] as const;
export type Module4BlockType = (typeof MODULE4_BLOCK_TYPES)[number];

export interface UnresolvedMapping {
  readonly id: string;
  readonly module3: string;
  readonly module4: string;
  readonly status: 'UNRESOLVED';
  readonly reason: string;
}

/**
 * Every Module 3 -> Module 4 concept pairing that has NO agreed mapping.
 *
 * Adapters in `src/adapters/optimizer.ts` carry the corresponding field as
 * `null` plus an explicit `status: 'UNRESOLVED'` marker, so an unresolved
 * decision is visible in the data instead of being papered over with a guess.
 */
export const UNRESOLVED_OPTIMIZER_MAPPINGS: readonly UnresolvedMapping[] = [
  {
    id: 'block_type',
    module3: 'SINGLE | INTEGRATED',
    module4: 'CORRIDOR | SHADOW | EMERGENCY | ROUTINE',
    status: 'UNRESOLVED',
    reason: 'Module 3 block_type describes integration topology; Module 4 BlockType is an operational possession class. No product decision exists.',
  },
  {
    id: 'objective_value',
    module3: 'ScheduleDTO.objective_value (solver objective)',
    module4: 'ObjectiveSummary.efficiencyScore',
    status: 'UNRESOLVED',
    reason: 'Different semantics: a weighted solver objective is not a 0-100 efficiency score. No normalisation is defined.',
  },
  {
    id: 'violation_severity',
    module3: 'ViolationDTO.severity (ERROR | WARNING | ...)',
    module4: "ConflictSeverity ('CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW')",
    status: 'UNRESOLVED',
    reason: 'Module 3 severity is a validator level; Module 4 severity is a criticality band. Collapsing ERROR into CRITICAL would fabricate meaning.',
  },
  {
    id: 'urgent_task',
    module3: 'MetricsDTO.scheduled_urgent_tasks / unscheduled_urgent_tasks',
    module4: "CriticalityLevel ('CRITICAL')",
    status: 'UNRESOLVED',
    reason: 'URGENT and CRITICAL are different axes; CRITICAL -> URGENT and URGENT -> CRITICAL conversions are forbidden.',
  },
  {
    id: 'risk_to_priority',
    module3: 'context.tasks[].risk / priority inputs',
    module4: 'BlockRequest.priority (number)',
    status: 'UNRESOLVED',
    reason: 'A risk level is not a priority weight; no conversion table has been agreed.',
  },
  {
    id: 'confidence_to_score',
    module3: 'context.priorities[].confidence (Module 2 output)',
    module4: 'AI recommendation score',
    status: 'UNRESOLVED',
    reason: 'Confidence is a probability, not a UI score; no rescaling has been agreed.',
  },
] as const;

/** `ScheduleDTO.objective_value` -> `efficiencyScore`: explicitly NOT done. */
export const UNRESOLVED_OBJECTIVE_MAPPING = {
  module3Field: 'objective_value',
  module4Field: 'efficiencyScore',
  status: 'UNRESOLVED',
  reason: 'DIFFERENT_SEMANTICS',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Module 4 view models (camelCase) — output of src/adapters/optimizer.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface OptimizerViolation {
  code: string;
  /** Verbatim Module 3 severity; never widened into a Module 4 severity band. */
  severity: string;
  message: string;
  affectedIds: string[];
  reason: string;
  severityMapping: {
    status: 'UNRESOLVED';
    uiSeverity: null;
    reason: 'NO_PRODUCT_DECISION';
  };
}

export interface OptimizerUnscheduledTask {
  taskId: string;
  scheduled: boolean;
  reason: string;
  candidateCount: number;
  feasibleCandidateCount: number;
  rejectionCodes: string[];
  metadata: OptimizerMetadata;
}

/**
 * `SINGLE | INTEGRATED` -> Module 4 `BlockType` is unresolved, so the adapter
 * exposes the value verbatim and leaves the UI field `null`.
 */
export interface OptimizerBlockTypeResolution {
  optimizerBlockType: OptimizerBlockType | null;
  /** Verbatim wire value, even when undocumented. */
  raw: string | null;
  uiBlockType: Module4BlockType | null;
  status: 'UNRESOLVED';
  reason: 'NO_PRODUCT_DECISION';
}

export interface OptimizerSelectedBlock {
  blockId: string;
  taskIds: string[];
  requestIds: string[];
  corridorId: string;
  section: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  integrated: boolean;
  blockTypeRaw: string | null;
  blockType: OptimizerBlockType | null;
  blockTypeResolution: OptimizerBlockTypeResolution;
  participatingDepartments: string[];
  resources: string[];
  status: string;
}

export interface OptimizerSchedule {
  scheduleId: string;
  status: string;
  message: string;
  /** Solver objective, verbatim. NOT an `efficiencyScore`. */
  objectiveValue: number;
  objectiveMapping: {
    status: 'UNRESOLVED';
    efficiencyScore: null;
    reason: 'DIFFERENT_SEMANTICS';
  };
  scheduledTaskIds: string[];
  unscheduledTaskIds: string[];
  unscheduledTasks: OptimizerUnscheduledTask[];
  selectedBlocks: OptimizerSelectedBlock[];
  solverMetadata: OptimizerMetadata;
}

export interface OptimizerValidation {
  scheduleId: string;
  solverStatus: string;
  valid: boolean;
  errors: OptimizerViolation[];
  warnings: OptimizerViolation[];
  checkedBlockCount: number;
  checkedTaskCount: number;
  metadata: OptimizerMetadata;
}

export interface OptimizerMetrics {
  totalTasksRequested: number;
  totalTasksScheduled: number;
  taskCoverageRatio: number;
  integratedBlocksCount: number;
  blockConsolidationRatio: number;
  averagePossessionMinutes: number;
  slotUtilisationPercent: number;
  resourceUtilisationPercent: number;
  scheduledUrgentTasks: number;
  unscheduledUrgentTasks: number;
  conflictsResolved: number;
  validationAccuracyPercent: number | null;
  extra: OptimizerMetadata;
}

export interface OptimizerExplanationRecord {
  subjectId: string;
  subjectType: string;
  status: string;
  reasonCodes: string[];
  summary: string;
  details: string[];
  evidence: OptimizerMetadata;
  metadata: OptimizerMetadata;
}

export interface OptimizerExplanation {
  scheduleId: string;
  solverStatus: string;
  scheduleValid: boolean | null;
  validationProvided: boolean;
  records: OptimizerExplanationRecord[];
  metadata: OptimizerMetadata;
}

export interface OptimizerCandidate {
  candidateId: string;
  taskIds: string[];
  corridorId: string;
  section: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  feasible: boolean;
  rejected: boolean;
  violations: OptimizerViolation[];
  metadata: OptimizerMetadata;
}

export interface OptimizerIntegratedBlock {
  blockId: string;
  taskIds: string[];
  requestIds: string[];
  corridorId: string;
  section: string;
  windowStart: string | null;
  windowEnd: string | null;
  earliestFeasibleStart: string | null;
  latestFeasibleEnd: string | null;
  totalRequiredDurationMinutes: number;
  participatingDepartments: string[];
  compatibility: string;
  violations: OptimizerViolation[];
  metadata: OptimizerMetadata;
}

export interface OptimizerPlan {
  requestId: string;
  planId: string;
  dataMode: string;
  storage: string;
  solverStatus: string;
  schedule: OptimizerSchedule;
  validation: OptimizerValidation | null;
  metrics: OptimizerMetrics | null;
  explanations: OptimizerExplanation | null;
  candidates: OptimizerCandidate[];
  integratedCandidates: OptimizerIntegratedBlock[];
  meta: OptimizerMetadata;
}

export interface OptimizerCandidatesResult {
  taskIds: string[];
  candidateCount: number;
  feasibleCount: number;
  rejectedCount: number;
  rejectionCodes: Record<string, number>;
  candidates: OptimizerCandidate[];
  dataMode: string;
  storage: string;
}

export interface OptimizerIntegratedBlocksResult {
  taskIds: string[];
  groupsExamined: number;
  compatibleCount: number;
  rejectionCodes: Record<string, number>;
  candidates: OptimizerIntegratedBlock[];
  dataMode: string;
  storage: string;
}

export interface OptimizerValidationResult {
  scheduleId: string;
  solverStatus: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  checkedBlockCount: number;
  checkedTaskCount: number;
  errors: OptimizerViolation[];
  warnings: OptimizerViolation[];
  metadata: OptimizerMetadata;
}

export interface OptimizerPlanMetrics {
  planId: string;
  metrics: OptimizerMetrics;
}

export interface OptimizerPlanConflicts {
  planId: string;
  solverStatus: string;
  validationValid: boolean | null;
  errorCount: number;
  warningCount: number;
  errors: OptimizerViolation[];
  warnings: OptimizerViolation[];
  rejectedCandidateCount: number;
  candidateRejectionCodes: Record<string, number>;
}

export interface OptimizerHealth {
  status: string;
  module: string;
  dataMode: string;
}
