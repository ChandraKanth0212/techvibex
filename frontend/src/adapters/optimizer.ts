/**
 * RailOpt Module 4 - Module 3 (Optimization Engine) adapter layer.
 *
 * Every function here is PURE and EXPLICIT:
 *   - no `{ ...dto }` spread-through: each target field is assigned by hand, so
 *     a new Module 3 field can never leak into the UI model unnoticed;
 *   - no field is renamed without a stated reason;
 *   - no value is invented, normalised or reinterpreted.
 *
 * Where Module 3 and Module 4 vocabularies do not line up, the adapter returns
 * the Module 3 value verbatim AND an explicit `status: 'UNRESOLVED'` marker
 * with a `null` Module 4 field. See `UNRESOLVED_OPTIMIZER_MAPPINGS`
 * (`@/types/optimizer`) for the full list of open product decisions.
 *
 * In particular, and by explicit product instruction:
 *   - `block_type: SINGLE | INTEGRATED` is NOT mapped to
 *     `CORRIDOR | SHADOW | EMERGENCY | ROUTINE`;
 *   - `objective_value` is NOT mapped to `efficiencyScore`;
 *   - violation severity is NOT widened into Module 4 criticality bands;
 *   - `URGENT` is NOT mapped to `CRITICAL`, risk is NOT priority, and
 *     confidence is NOT score.
 */

import type {
  CandidateDTO,
  CandidatesResponse,
  ExplanationDTO,
  ExplanationRecordDTO,
  HealthResponse,
  IntegratedBlockDTO,
  IntegratedBlocksResponse,
  MetricsDTO,
  OptimizerBlockType,
  OptimizerCandidate,
  OptimizerCandidatesResult,
  OptimizerExplanation,
  OptimizerExplanationRecord,
  OptimizerHealth,
  OptimizerIntegratedBlock,
  OptimizerIntegratedBlocksResult,
  OptimizerMetadata,
  OptimizerMetrics,
  OptimizerPlan,
  OptimizerPlanConflicts,
  OptimizerPlanMetrics,
  OptimizerSchedule,
  OptimizerSelectedBlock,
  OptimizerUnscheduledTask,
  OptimizerValidation,
  OptimizerValidationResult,
  OptimizerViolation,
  PlanConflictsResponse,
  PlanMetricsResponse,
  PlanResponse,
  ScheduleDTO,
  SelectedBlockDTO,
  UnscheduledTaskDTO,
  ValidationDTO,
  ValidationResponse,
  ViolationDTO,
} from '@/types/optimizer';

// ── Shared, explicitly unresolved markers ────────────────────────────────────

const BLOCK_TYPE_RESOLUTION = {
  uiBlockType: null,
  status: 'UNRESOLVED',
  reason: 'NO_PRODUCT_DECISION',
} as const;

const SEVERITY_MAPPING = {
  uiSeverity: null,
  status: 'UNRESOLVED',
  reason: 'NO_PRODUCT_DECISION',
} as const;

const OBJECTIVE_MAPPING = {
  efficiencyScore: null,
  status: 'UNRESOLVED',
  reason: 'DIFFERENT_SEMANTICS',
} as const;

/** Module 3 documents exactly two block types; anything else stays a raw string. */
function narrowBlockType(value: string | null): OptimizerBlockType | null {
  if (value === 'SINGLE' || value === 'INTEGRATED') return value;
  return null;
}

function cloneMetadata(value: OptimizerMetadata | undefined | null): OptimizerMetadata {
  return { ...(value ?? {}) };
}

function cloneCountMap(value: Record<string, number> | undefined | null): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of Object.keys(value ?? {}).sort()) {
    result[key] = value?.[key] as number;
  }
  return result;
}

function copyStrings(value: string[] | undefined | null): string[] {
  return [...(value ?? [])];
}

// ── Leaf mappers ─────────────────────────────────────────────────────────────

export function mapViolation(dto: ViolationDTO): OptimizerViolation {
  return {
    code: dto.code,
    severity: dto.severity,
    message: dto.message,
    affectedIds: copyStrings(dto.affected_ids),
    reason: dto.reason,
    // Module 3 severity (ERROR/WARNING/...) is not a Module 4 severity band.
    severityMapping: { ...SEVERITY_MAPPING },
  };
}

export function mapViolations(dtos: ViolationDTO[] | undefined | null): OptimizerViolation[] {
  return (dtos ?? []).map(mapViolation);
}

export function mapUnscheduledTask(dto: UnscheduledTaskDTO): OptimizerUnscheduledTask {
  return {
    taskId: dto.task_id,
    scheduled: dto.scheduled,
    reason: dto.reason,
    candidateCount: dto.candidate_count,
    feasibleCandidateCount: dto.feasible_candidate_count,
    rejectionCodes: copyStrings(dto.rejection_codes),
    metadata: cloneMetadata(dto.metadata),
  };
}

export function mapSelectedBlock(dto: SelectedBlockDTO): OptimizerSelectedBlock {
  return {
    blockId: dto.block_id,
    taskIds: copyStrings(dto.task_ids),
    requestIds: copyStrings(dto.request_ids),
    corridorId: dto.corridor_id,
    section: dto.section,
    startTime: dto.start_time,
    endTime: dto.end_time,
    durationMinutes: dto.duration_minutes,
    integrated: dto.integrated,
    blockTypeRaw: dto.block_type,
    blockType: narrowBlockType(dto.block_type),
    // UNRESOLVED: SINGLE | INTEGRATED -> CORRIDOR | SHADOW | EMERGENCY | ROUTINE
    // has no product decision, so `uiBlockType` stays null.
    blockTypeResolution: {
      optimizerBlockType: narrowBlockType(dto.block_type),
      raw: dto.block_type,
      ...BLOCK_TYPE_RESOLUTION,
    },
    participatingDepartments: copyStrings(dto.participating_departments),
    resources: copyStrings(dto.resources),
    status: dto.status,
  };
}

export function mapSchedule(dto: ScheduleDTO): OptimizerSchedule {
  return {
    scheduleId: dto.schedule_id,
    status: dto.status,
    message: dto.message,
    // Verbatim solver objective. NOT an efficiency score.
    objectiveValue: dto.objective_value,
    objectiveMapping: { ...OBJECTIVE_MAPPING },
    scheduledTaskIds: copyStrings(dto.scheduled_task_ids),
    unscheduledTaskIds: copyStrings(dto.unscheduled_task_ids),
    unscheduledTasks: dto.unscheduled_tasks.map(mapUnscheduledTask),
    selectedBlocks: dto.selected_blocks.map(mapSelectedBlock),
    solverMetadata: cloneMetadata(dto.solver_metadata),
  };
}

export function mapValidation(dto: ValidationDTO): OptimizerValidation {
  return {
    scheduleId: dto.schedule_id,
    solverStatus: dto.solver_status,
    valid: dto.valid,
    // Module 3 already separates errors from warnings: no severity re-bucketing.
    errors: mapViolations(dto.errors),
    warnings: mapViolations(dto.warnings),
    checkedBlockCount: dto.checked_block_count,
    checkedTaskCount: dto.checked_task_count,
    metadata: cloneMetadata(dto.metadata),
  };
}

export function mapMetrics(dto: MetricsDTO): OptimizerMetrics {
  return {
    totalTasksRequested: dto.total_tasks_requested,
    totalTasksScheduled: dto.total_tasks_scheduled,
    taskCoverageRatio: dto.task_coverage_ratio,
    integratedBlocksCount: dto.integrated_blocks_count,
    blockConsolidationRatio: dto.block_consolidation_ratio,
    averagePossessionMinutes: dto.average_possession_minutes,
    slotUtilisationPercent: dto.slot_utilisation_percent,
    resourceUtilisationPercent: dto.resource_utilisation_percent,
    scheduledUrgentTasks: dto.scheduled_urgent_tasks,
    unscheduledUrgentTasks: dto.unscheduled_urgent_tasks,
    conflictsResolved: dto.conflicts_resolved,
    validationAccuracyPercent: dto.validation_accuracy_percent,
    extra: cloneMetadata(dto.extra),
  };
}

export function mapExplanationRecord(dto: ExplanationRecordDTO): OptimizerExplanationRecord {
  return {
    subjectId: dto.subject_id,
    subjectType: dto.subject_type,
    status: dto.status,
    reasonCodes: copyStrings(dto.reason_codes),
    summary: dto.summary,
    details: copyStrings(dto.details),
    evidence: cloneMetadata(dto.evidence),
    metadata: cloneMetadata(dto.metadata),
  };
}

export function mapExplanation(dto: ExplanationDTO): OptimizerExplanation {
  return {
    scheduleId: dto.schedule_id,
    solverStatus: dto.solver_status,
    scheduleValid: dto.schedule_valid,
    validationProvided: dto.validation_provided,
    records: dto.records.map(mapExplanationRecord),
    metadata: cloneMetadata(dto.metadata),
  };
}

export function mapCandidate(dto: CandidateDTO): OptimizerCandidate {
  return {
    candidateId: dto.candidate_id,
    taskIds: copyStrings(dto.task_ids),
    corridorId: dto.corridor_id,
    section: dto.section,
    startTime: dto.start_time,
    endTime: dto.end_time,
    durationMinutes: dto.duration_minutes,
    feasible: dto.feasible,
    rejected: dto.rejected,
    violations: mapViolations(dto.violations),
    metadata: cloneMetadata(dto.metadata),
  };
}

export function mapIntegratedBlock(dto: IntegratedBlockDTO): OptimizerIntegratedBlock {
  return {
    blockId: dto.block_id,
    taskIds: copyStrings(dto.task_ids),
    requestIds: copyStrings(dto.request_ids),
    corridorId: dto.corridor_id,
    section: dto.section,
    windowStart: dto.window_start,
    windowEnd: dto.window_end,
    earliestFeasibleStart: dto.earliest_feasible_start,
    latestFeasibleEnd: dto.latest_feasible_end,
    totalRequiredDurationMinutes: dto.total_required_duration_minutes,
    participatingDepartments: copyStrings(dto.participating_departments),
    compatibility: dto.compatibility,
    violations: mapViolations(dto.violations),
    metadata: cloneMetadata(dto.metadata),
  };
}

// ── Aggregate mappers ────────────────────────────────────────────────────────

export function mapPlan(dto: PlanResponse): OptimizerPlan {
  return {
    requestId: dto.request_id,
    planId: dto.plan_id,
    dataMode: dto.data_mode,
    storage: dto.storage,
    solverStatus: dto.solver_status,
    schedule: mapSchedule(dto.schedule),
    validation: dto.validation === null ? null : mapValidation(dto.validation),
    metrics: dto.metrics === null ? null : mapMetrics(dto.metrics),
    explanations: dto.explanations === null ? null : mapExplanation(dto.explanations),
    candidates: dto.candidates.map(mapCandidate),
    integratedCandidates: dto.integrated_candidates.map(mapIntegratedBlock),
    meta: cloneMetadata(dto.meta),
  };
}

export function mapCandidatesResponse(dto: CandidatesResponse): OptimizerCandidatesResult {
  return {
    taskIds: copyStrings(dto.task_ids),
    candidateCount: dto.candidate_count,
    feasibleCount: dto.feasible_count,
    rejectedCount: dto.rejected_count,
    rejectionCodes: cloneCountMap(dto.rejection_codes),
    candidates: dto.candidates.map(mapCandidate),
    dataMode: dto.data_mode,
    storage: dto.storage,
  };
}

export function mapIntegratedBlocksResponse(dto: IntegratedBlocksResponse): OptimizerIntegratedBlocksResult {
  return {
    taskIds: copyStrings(dto.task_ids),
    groupsExamined: dto.groups_examined,
    compatibleCount: dto.compatible_count,
    rejectionCodes: cloneCountMap(dto.rejection_codes),
    candidates: dto.candidates.map(mapIntegratedBlock),
    dataMode: dto.data_mode,
    storage: dto.storage,
  };
}

export function mapValidationResponse(dto: ValidationResponse): OptimizerValidationResult {
  return {
    scheduleId: dto.schedule_id,
    solverStatus: dto.solver_status,
    valid: dto.valid,
    errorCount: dto.error_count,
    warningCount: dto.warning_count,
    checkedBlockCount: dto.checked_block_count,
    checkedTaskCount: dto.checked_task_count,
    errors: mapViolations(dto.errors),
    warnings: mapViolations(dto.warnings),
    metadata: cloneMetadata(dto.metadata),
  };
}

export function mapPlanMetricsResponse(dto: PlanMetricsResponse): OptimizerPlanMetrics {
  return {
    planId: dto.plan_id,
    metrics: mapMetrics(dto.metrics),
  };
}

export function mapPlanConflictsResponse(dto: PlanConflictsResponse): OptimizerPlanConflicts {
  return {
    planId: dto.plan_id,
    solverStatus: dto.solver_status,
    validationValid: dto.validation_valid,
    errorCount: dto.error_count,
    warningCount: dto.warning_count,
    errors: mapViolations(dto.errors),
    warnings: mapViolations(dto.warnings),
    rejectedCandidateCount: dto.rejected_candidate_count,
    candidateRejectionCodes: cloneCountMap(dto.candidate_rejection_codes),
  };
}

export function mapHealth(dto: HealthResponse): OptimizerHealth {
  return {
    status: dto.status,
    module: dto.module,
    dataMode: dto.dataMode,
  };
}
