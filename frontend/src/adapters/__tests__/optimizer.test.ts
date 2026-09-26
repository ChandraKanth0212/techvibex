import { describe, expect, it } from 'vitest';
import {
  mapCandidate,
  mapCandidatesResponse,
  mapExplanation,
  mapHealth,
  mapIntegratedBlock,
  mapMetrics,
  mapPlan,
  mapPlanConflictsResponse,
  mapPlanMetricsResponse,
  mapSchedule,
  mapSelectedBlock,
  mapUnscheduledTask,
  mapValidation,
  mapValidationResponse,
  mapViolation,
} from '@/adapters/optimizer';
import {
  MODULE4_BLOCK_TYPES,
  UNRESOLVED_OBJECTIVE_MAPPING,
  UNRESOLVED_OPTIMIZER_MAPPINGS,
  type PlanResponse,
  type SelectedBlockDTO,
} from '@/types/optimizer';
import {
  BLOCK,
  CANDIDATE,
  ERROR_VIOLATION,
  PLAN_RESPONSE,
  SINGLE_BLOCK,
  UNSCHEDULED_TASK,
  VALIDATION,
  clonePlan,
} from '@/services/__tests__/optimizerFixtures';

describe('snake_case -> camelCase mapping', () => {
  it('maps a violation field by field', () => {
    expect(mapViolation(ERROR_VIOLATION)).toEqual({
      code: 'TASK_WINDOW_VIOLATION',
      severity: 'ERROR',
      message: 'task window violated',
      affectedIds: ['BLK-0001'],
      reason: 'block starts before the requested window',
      severityMapping: { uiSeverity: null, status: 'UNRESOLVED', reason: 'NO_PRODUCT_DECISION' },
    });
  });

  it('maps an unscheduled task field by field', () => {
    expect(mapUnscheduledTask(UNSCHEDULED_TASK)).toEqual({
      taskId: 'TASK-004',
      scheduled: false,
      reason: 'no feasible candidate',
      candidateCount: 2,
      feasibleCandidateCount: 0,
      rejectionCodes: ['TRAIN_MOVEMENT_CONFLICT'],
      metadata: { source: 'SYNTHETIC_DEMO' },
    });
  });

  it('maps a selected block field by field', () => {
    const mapped = mapSelectedBlock(BLOCK);

    expect(mapped.blockId).toBe('BLK-0001');
    expect(mapped.taskIds).toEqual(['TASK-001', 'TASK-002']);
    expect(mapped.requestIds).toEqual(['REQ-0001']);
    expect(mapped.corridorId).toBe('CORR-SEC-01');
    expect(mapped.section).toBe('SEC-HYB');
    expect(mapped.startTime).toBe('2026-01-05T08:00:00');
    expect(mapped.endTime).toBe('2026-01-05T10:30:00');
    expect(mapped.durationMinutes).toBe(150);
    expect(mapped.integrated).toBe(true);
    expect(mapped.participatingDepartments).toEqual(['ENGINEERING', 'SNT']);
    expect(mapped.resources).toEqual(['RES-01', 'RES-02']);
    expect(mapped.status).toBe('SCHEDULED');
    expect(Object.keys(mapped).sort()).toEqual(
      [
        'blockId',
        'blockType',
        'blockTypeRaw',
        'blockTypeResolution',
        'corridorId',
        'durationMinutes',
        'endTime',
        'integrated',
        'participatingDepartments',
        'requestIds',
        'resources',
        'section',
        'startTime',
        'status',
        'taskIds',
      ].sort(),
    );
  });

  it('maps metrics without inventing fields', () => {
    const mapped = mapMetrics(PLAN_RESPONSE.metrics!);

    expect(mapped.totalTasksRequested).toBe(3);
    expect(mapped.totalTasksScheduled).toBe(2);
    expect(mapped.taskCoverageRatio).toBe(0.6667);
    expect(mapped.integratedBlocksCount).toBe(1);
    expect(mapped.blockConsolidationRatio).toBe(0.5);
    expect(mapped.averagePossessionMinutes).toBe(150);
    expect(mapped.slotUtilisationPercent).toBe(12.5);
    expect(mapped.resourceUtilisationPercent).toBe(40);
    expect(mapped.scheduledUrgentTasks).toBe(1);
    expect(mapped.unscheduledUrgentTasks).toBe(0);
    expect(mapped.conflictsResolved).toBe(1);
    expect(mapped.validationAccuracyPercent).toBe(92.5);
    expect(mapped.extra).toEqual({ model: 'demo' });
  });

  it('preserves a null validation_accuracy_percent instead of defaulting it', () => {
    const metrics = { ...PLAN_RESPONSE.metrics!, validation_accuracy_percent: null };
    expect(mapMetrics(metrics).validationAccuracyPercent).toBeNull();
  });

  it('maps validation, explanations, candidates and integrated blocks', () => {
    const validation = mapValidation(VALIDATION);
    expect(validation.scheduleId).toBe('SCH-0001');
    expect(validation.solverStatus).toBe('OPTIMAL');
    expect(validation.valid).toBe(false);
    expect(validation.errors.map((error) => error.code)).toEqual(['TASK_WINDOW_VIOLATION']);
    expect(validation.warnings.map((warning) => warning.code)).toEqual(['GOODS_FORECAST_ELEVATED']);
    expect(validation.checkedBlockCount).toBe(1);
    expect(validation.checkedTaskCount).toBe(3);

    const explanation = mapExplanation(PLAN_RESPONSE.explanations!);
    expect(explanation.scheduleId).toBe('SCH-0001');
    expect(explanation.scheduleValid).toBe(false);
    expect(explanation.validationProvided).toBe(true);
    expect(explanation.records[0].subjectId).toBe('TASK-001');
    expect(explanation.records[0].reasonCodes).toEqual(['RESOURCES_AVAILABLE']);
    expect(explanation.records[0].details).toEqual(['corridor available']);

    const candidate = mapCandidate(CANDIDATE);
    expect(candidate.candidateId).toBe('CAND-0001');
    expect(candidate.corridorId).toBe('CORR-SEC-01');
    expect(candidate.durationMinutes).toBe(60);
    expect(candidate.feasible).toBe(true);
    expect(candidate.rejected).toBe(false);

    const integrated = mapIntegratedBlock(PLAN_RESPONSE.integrated_candidates[0]);
    expect(integrated.blockId).toBe('INT-0001');
    expect(integrated.windowStart).toBe('2026-01-05T08:00:00');
    expect(integrated.latestFeasibleEnd).toBe('2026-01-05T10:30:00');
    expect(integrated.totalRequiredDurationMinutes).toBe(150);
    expect(integrated.compatibility).toBe('COMPATIBLE');
  });

  it('maps a whole plan, including nullable sections', () => {
    const plan = mapPlan(clonePlan());

    expect(plan.planId).toBe('PLAN-abc123');
    expect(plan.requestId).toBe('REQ-0001');
    expect(plan.dataMode).toBe('SYNTHETIC_DEMO');
    expect(plan.storage).toBe('IN_MEMORY');
    expect(plan.solverStatus).toBe('OPTIMAL');
    expect(plan.schedule.scheduledTaskIds).toEqual(['TASK-001', 'TASK-002']);
    expect(plan.schedule.unscheduledTaskIds).toEqual(['TASK-004']);
    expect(plan.validation?.errors).toHaveLength(1);
    expect(plan.metrics?.totalTasksScheduled).toBe(2);
    expect(plan.explanations?.records).toHaveLength(1);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.integratedCandidates).toHaveLength(1);
    expect(plan.meta).toEqual({ scope_task_ids: ['TASK-001', 'TASK-002', 'TASK-004'] });

    const withoutOptionals = mapPlan({ ...clonePlan(), validation: null, metrics: null, explanations: null });
    expect(withoutOptionals.validation).toBeNull();
    expect(withoutOptionals.metrics).toBeNull();
    expect(withoutOptionals.explanations).toBeNull();
  });

  it('maps the metrics, conflicts, validation and health envelopes', () => {
    const plan = clonePlan();
    expect(mapPlanMetricsResponse({ plan_id: plan.plan_id, metrics: plan.metrics! })).toEqual({
      planId: 'PLAN-abc123',
      metrics: mapMetrics(plan.metrics!),
    });

    const conflicts = mapPlanConflictsResponse({
      plan_id: plan.plan_id,
      solver_status: 'OPTIMAL',
      validation_valid: false,
      error_count: 1,
      warning_count: 1,
      errors: plan.validation!.errors,
      warnings: plan.validation!.warnings,
      rejected_candidate_count: 1,
      candidate_rejection_codes: { TRAIN_MOVEMENT_CONFLICT: 1 },
    });
    expect(conflicts.planId).toBe('PLAN-abc123');
    expect(conflicts.validationValid).toBe(false);
    expect(conflicts.rejectedCandidateCount).toBe(1);
    expect(conflicts.candidateRejectionCodes).toEqual({ TRAIN_MOVEMENT_CONFLICT: 1 });

    const candidates = mapCandidatesResponse({
      task_ids: ['TASK-001'],
      candidate_count: 1,
      feasible_count: 1,
      rejected_count: 0,
      rejection_codes: {},
      candidates: plan.candidates,
      data_mode: 'SYNTHETIC_DEMO',
      storage: 'IN_MEMORY',
    });
    expect(candidates.candidateCount).toBe(1);
    expect(candidates.feasibleCount).toBe(1);
    expect(candidates.candidates[0].candidateId).toBe('CAND-0001');

    const validation = mapValidationResponse({
      schedule_id: 'SCH-0001',
      solver_status: 'OPTIMAL',
      valid: true,
      error_count: 0,
      warning_count: 0,
      checked_block_count: 1,
      checked_task_count: 2,
      errors: [],
      warnings: [],
      metadata: {},
    });
    expect(validation.valid).toBe(true);
    expect(validation.errorCount).toBe(0);

    expect(mapHealth({ status: 'ok', module: 'optimization-engine', dataMode: 'SYNTHETIC_DEMO' })).toEqual({
      status: 'ok',
      module: 'optimization-engine',
      dataMode: 'SYNTHETIC_DEMO',
    });
  });

  it('does not copy unknown Module 3 fields through', () => {
    const polluted = {
      ...clonePlan(),
      undocumented_top_level_field: 'leak',
    } as PlanResponse & { undocumented_top_level_field: string };
    const pollutedBlock = {
      ...BLOCK,
      undocumented_block_field: 'leak',
    } as SelectedBlockDTO & { undocumented_block_field: string };

    const plan = mapPlan(polluted);
    const mappedBlock = mapSelectedBlock(pollutedBlock);

    expect('undocumented_top_level_field' in plan).toBe(false);
    expect('undocumented_block_field' in mappedBlock).toBe(false);
    expect(JSON.stringify(plan)).not.toContain('leak');
  });
});

describe('deterministic adapter output', () => {
  it('produces identical output for identical input', () => {
    const first = mapPlan(clonePlan());
    const second = mapPlan(clonePlan());

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(second).toEqual(first);
  });

  it('produces identical output regardless of rejection_codes key order', () => {
    const forwards = mapCandidatesResponse({
      task_ids: ['TASK-001'],
      candidate_count: 0,
      feasible_count: 0,
      rejected_count: 2,
      rejection_codes: { A: 1, B: 1 },
      candidates: [],
      data_mode: 'SYNTHETIC_DEMO',
      storage: 'IN_MEMORY',
    });
    const backwards = mapCandidatesResponse({
      task_ids: ['TASK-001'],
      candidate_count: 0,
      feasible_count: 0,
      rejected_count: 2,
      rejection_codes: { B: 1, A: 1 },
      candidates: [],
      data_mode: 'SYNTHETIC_DEMO',
      storage: 'IN_MEMORY',
    });

    expect(JSON.stringify(backwards)).toBe(JSON.stringify(forwards));
  });

  it('does not share mutable references with the DTO', () => {
    const dto = clonePlan();
    const mapped = mapPlan(dto);

    mapped.schedule.selectedBlocks[0].taskIds.push('TASK-999');
    mapped.meta.scope_task_ids = [];

    expect(dto.schedule.selected_blocks[0].task_ids).toEqual(['TASK-001', 'TASK-002']);
    expect(dto.meta.scope_task_ids).toEqual(['TASK-001', 'TASK-002', 'TASK-004']);
  });
});

describe('block_type stays unresolved', () => {
  it.each<[string, SelectedBlockDTO]>([
    ['INTEGRATED', BLOCK],
    ['SINGLE', SINGLE_BLOCK],
  ])('keeps %s without a Module 4 block type', (blockType, dto) => {
    const mapped = mapSelectedBlock(dto);

    expect(mapped.blockType).toBe(blockType);
    expect(mapped.blockTypeRaw).toBe(blockType);
    expect(mapped.blockTypeResolution).toEqual({
      optimizerBlockType: blockType,
      raw: blockType,
      uiBlockType: null,
      status: 'UNRESOLVED',
      reason: 'NO_PRODUCT_DECISION',
    });
    for (const uiType of MODULE4_BLOCK_TYPES) {
      expect(JSON.stringify(mapped)).not.toContain(uiType);
    }
  });

  it('keeps an undocumented block_type as a raw string and still unresolved', () => {
    const mapped = mapSelectedBlock({ ...BLOCK, block_type: 'EMERGENCY' });

    expect(mapped.blockTypeRaw).toBe('EMERGENCY');
    expect(mapped.blockType).toBeNull();
    expect(mapped.blockTypeResolution.uiBlockType).toBeNull();
    expect(mapped.blockTypeResolution.status).toBe('UNRESOLVED');
  });

  it('keeps a null block_type unresolved', () => {
    const mapped = mapSelectedBlock({ ...BLOCK, block_type: null });

    expect(mapped.blockTypeRaw).toBeNull();
    expect(mapped.blockType).toBeNull();
    expect(mapped.blockTypeResolution.uiBlockType).toBeNull();
  });

  it('documents the block_type decision as unresolved', () => {
    const entry = UNRESOLVED_OPTIMIZER_MAPPINGS.find((mapping) => mapping.id === 'block_type');
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('UNRESOLVED');
    expect(entry?.module3).toBe('SINGLE | INTEGRATED');
    expect(entry?.module4).toBe('CORRIDOR | SHADOW | EMERGENCY | ROUTINE');
  });
});

describe('objective_value is not an efficiencyScore', () => {
  it('keeps objective_value verbatim under its own name', () => {
    const mapped = mapSchedule(clonePlan().schedule);

    expect(mapped.objectiveValue).toBe(0.8734);
    expect(mapped.objectiveMapping).toEqual({
      efficiencyScore: null,
      status: 'UNRESOLVED',
      reason: 'DIFFERENT_SEMANTICS',
    });
  });

  it('never emits an efficiencyScore value', () => {
    const mapped = mapSchedule(clonePlan().schedule);

    // No efficiency score on the schedule itself...
    expect('efficiencyScore' in mapped).toBe(false);
    expect(Object.values(mapped)).not.toContain('efficiencyScore');
    // ...the only mention is the explicit unresolved marker, whose value is null.
    expect(JSON.stringify(mapped)).not.toContain('"efficiencyScore":0');
    expect(JSON.stringify(mapped).match(/"efficiencyScore":[^,}]*/g)).toEqual(['"efficiencyScore":null']);
  });

  it('keeps the objective mapping registered as unresolved', () => {
    expect(UNRESOLVED_OBJECTIVE_MAPPING).toEqual({
      module3Field: 'objective_value',
      module4Field: 'efficiencyScore',
      status: 'UNRESOLVED',
      reason: 'DIFFERENT_SEMANTICS',
    });
    expect(UNRESOLVED_OPTIMIZER_MAPPINGS.some((mapping) => mapping.id === 'objective_value')).toBe(true);
  });
});

describe('other forbidden conversions are not performed', () => {
  it('does not widen violation severity into a Module 4 band', () => {
    const mapped = mapViolation(ERROR_VIOLATION);

    expect(mapped.severity).toBe('ERROR');
    expect(mapped.severityMapping.uiSeverity).toBeNull();
    for (const band of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
      expect(mapped.severityMapping.uiSeverity).not.toBe(band);
    }
  });

  it('does not rename urgent task counters into criticality fields', () => {
    const mapped = mapMetrics(PLAN_RESPONSE.metrics!);

    expect(mapped.scheduledUrgentTasks).toBe(1);
    expect('criticalTasks' in mapped).toBe(false);
    expect(UNRESOLVED_OPTIMIZER_MAPPINGS.some((mapping) => mapping.id === 'urgent_task')).toBe(true);
  });

  it('keeps risk, priority and confidence conversions on the unresolved list', () => {
    const ids = UNRESOLVED_OPTIMIZER_MAPPINGS.map((mapping) => mapping.id);
    expect(ids).toContain('risk_to_priority');
    expect(ids).toContain('confidence_to_score');
    expect(UNRESOLVED_OPTIMIZER_MAPPINGS.every((mapping) => mapping.status === 'UNRESOLVED')).toBe(true);
  });
});
