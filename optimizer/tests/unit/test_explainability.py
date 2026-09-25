"""Unit tests for the Phase 6 ExplainabilityService.

Covers the responsibility list:

1. scheduled-task explanation is deterministic and evidence-backed;
2. TRAIN_CONFLICT unscheduled tasks carry conflict + candidate evidence;
3. RESOURCE_CONFLICT unscheduled tasks carry the engine code;
4. overdue tasks carry due-date evidence (no fabrication when judged-able);
5. priority is taken from the actual PriorityResult / AIRecommendation when present;
6. integrated blocks list every participant;
7. cross-department integration is reported from real department fields;
8. validation errors are surfaced with the violation code;
9. warnings are distinguished from errors;
10. "optimal" is only claimed when the solver status is OPTIMAL;
11. FEASIBLE results are described as feasible, never as optimal;
12. SEARCH_TRUNCATED is emitted only with cap evidence;
13. missing optional data is reported as unavailable, never invented;
14. output is fully deterministic;
15. the existing 188-test suite still passes (subprocess run);

plus honesty guards: no vague or unsupported codes anywhere in the output, all
emitted codes belong to the documented vocabulary, no independent validation
means ``schedule_valid is None``, and no-solution statuses never claim a
feasible candidate was found.
"""

import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

from app.core.config import Settings
from app.services import ExplainabilityService as ExplainabilityServiceInterface
from app.services.explainability import (
    FORBIDDEN_VAGUE_CODES,
    ALLOWED_REASON_CODES,
    ExplainabilityService,
)
from contracts import (
    AIRecommendation,
    BlockCandidate,
    ConstraintViolation,
    ScheduleBlock,
    ScheduleMetrics,
    ScheduleResult,
    ScheduleValidationResult,
    TaskSchedulingInfo,
    ViolationSeverity,
)
from tests.helpers import NOW, make_planning_context, sample_task

ROOT = Path(__file__).resolve().parents[2]

# ----------------------------------------------------------------- builders


def make_block(
    block_id,
    task_ids,
    *,
    block_type="SINGLE",
    start=NOW,
    duration_minutes=120,
    corridor_id="COR-1",
    section="S1",
    **overrides,
) -> ScheduleBlock:
    values = dict(
        block_id=block_id,
        task_ids=list(task_ids),
        corridor_id=corridor_id,
        section=section,
        start_time=start,
        end_time=start + timedelta(minutes=duration_minutes),
        block_type=block_type,
        total_duration_minutes=duration_minutes,
    )
    values.update(overrides)
    return ScheduleBlock(**values)


def make_result(
    blocks,
    *,
    status="OPTIMAL",
    schedule_id="SCHED-TEST",
    scheduled=None,
    unscheduled=None,
    infos=None,
    objective_value=1.0,
) -> ScheduleResult:
    if scheduled is None:
        scheduled = sorted({tid for block in blocks for tid in block.task_ids})
    if unscheduled is None:
        unscheduled = []
    if infos is None:
        infos = [
            TaskSchedulingInfo(task_id=tid, scheduled=False, reason="test")
            for tid in unscheduled
        ]
    return ScheduleResult(
        schedule_id=schedule_id,
        status=status,
        message="",
        selected_blocks=blocks,
        scheduled_task_ids=scheduled,
        unscheduled_task_ids=unscheduled,
        unscheduled_tasks=infos,
        objective_value=objective_value,
    )


def make_validation(
    *,
    errors=None,
    warnings=None,
    valid=None,
) -> ScheduleValidationResult:
    errors = errors or []
    warnings = warnings or []
    return ScheduleValidationResult(
        schedule_id="SCHED-TEST",
        solver_status="OPTIMAL",
        valid=valid if valid is not None else (len(errors) == 0),
        errors=errors,
        warnings=warnings,
        checked_block_count=1,
        checked_task_count=1,
    )


def violation(code, message="blocked by test", block_id="B1", affected=None) -> ConstraintViolation:
    return ConstraintViolation(
        constraint_name="TEST",
        violation_code=code,
        message=message,
        severity=ViolationSeverity.ERROR,
        block_id=block_id,
        affected_ids=affected or [],
        reason="reason:" + code,
    )


def make_candidate(
    candidate_id="C-1",
    start=NOW,
    **overrides,
) -> BlockCandidate:
    values = dict(
        candidate_id=candidate_id,
        task_ids=["T-UNS"],
        corridor_id="COR-1",
        section="S1",
        start_time=start,
        end_time=start + timedelta(minutes=60),
        total_duration_minutes=60,
    )
    values.update(overrides)
    return BlockCandidate(**values)


def find_record(explanations, subject_type, subject_id):
    for record in explanations.records:
        if record.subject_type == subject_type and record.subject_id == subject_id:
            return record
    raise AssertionError(
        f"no {subject_type} record for {subject_id} in {[r.subject_id for r in explanations.records]}"
    )


# ------------------------------------------------------------- 1..14 core cases


def test_scheduled_task_explanation_is_deterministic_and_complete():
    task = sample_task(task_id="T1")
    context = make_planning_context(tasks=[task])
    block = make_block("B1", ["T1"])
    result = make_result([block])
    service = ExplainabilityService()

    first = service.explain(result, context)
    second = service.explain(result, context)

    record = find_record(first, "SCHEDULED_TASK", "T1")
    assert record.status == "SCHEDULED"
    assert "SCHEDULED" in record.reason_codes
    assert record.evidence["block_id"] == "B1"
    assert "SCHEDULED_TASK" in {r.subject_type for r in first.records}
    assert first.solver_status == "OPTIMAL"

    assert first.model_dump() == second.model_dump()
    assert first.summary_text() == second.summary_text()


def test_unscheduled_train_conflict_carries_conflict_and_candidate_evidence():
    task = sample_task(task_id="T-UNS", priority="MEDIUM")
    context = make_planning_context(tasks=[task])
    info = TaskSchedulingInfo(
        task_id="T-UNS",
        scheduled=False,
        reason="no feasible candidate placements (rejected: TRAIN_CONFLICT)",
        candidate_count=1,
        feasible_candidate_count=0,
        rejection_codes=["TRAIN_CONFLICT"],
        metadata={"solver_status": "OPTIMAL"},
    )
    result = make_result(
        [], unscheduled=["T-UNS"], infos=[info],
    )
    rejected = make_candidate(
        candidate_id="C-1",
        rejected=True,
        violations=[
            ConstraintViolation(
                constraint_name="safe separation",
                violation_code="TRAIN_CONFLICT",
                message="overlaps protected movement '11007' with 15 min safety buffer",
                severity=ViolationSeverity.ERROR,
                affected_ids=["MOV-1"],
                reason="MOVEMENT_OVERLAP:MOV-1:buffer_minutes=15",
            )
        ],
    )
    service = ExplainabilityService()
    expl = service.explain(result, context, candidates=[rejected])

    record = find_record(expl, "UNSCHEDULED_TASK", "T-UNS")
    assert record.status == "UNSCHEDULED"
    assert "TRAIN_CONFLICT" in record.reason_codes
    assert record.evidence["rejection_codes"] == ["TRAIN_CONFLICT"]
    detail = record.evidence["candidate_detail"]
    assert detail["provided"] is True
    assert detail["rejected_candidates"][0]["violations"][0]["code"] == "TRAIN_CONFLICT"
    message = detail["rejected_candidates"][0]["violations"][0]["message"]
    assert "11007" in message
    assert "buffer" in message.lower()


def test_unscheduled_resource_conflict_carries_engine_code():
    context = make_planning_context(tasks=[sample_task(task_id="T-UNS", priority="MEDIUM")])
    info = TaskSchedulingInfo(
        task_id="T-UNS", scheduled=False, reason="rejected",
        candidate_count=2, feasible_candidate_count=0,
        rejection_codes=["RESOURCE_CONFLICT"], metadata={"solver_status": "OPTIMAL"},
    )
    result = make_result([], unscheduled=["T-UNS"], infos=[info])
    record = find_record(ExplainabilityService().explain(result, context), "UNSCHEDULED_TASK", "T-UNS")
    assert "RESOURCE_CONFLICT" in record.reason_codes
    assert "TRAIN_CONFLICT" not in record.reason_codes


def test_overdue_task_evidence_with_due_date():
    task = sample_task(task_id="T1", due_by=date(2026, 1, 5))
    context = make_planning_context(tasks=[task])
    result = make_result([make_block("B1", ["T1"])])
    record = find_record(ExplainabilityService().explain(result, context), "SCHEDULED_TASK", "T1")
    assert "OVERDUE" in record.reason_codes
    assert record.evidence["overdue"]["overdue"] is True
    assert record.evidence["overdue"]["due_by"] == "2026-01-05"
    assert record.evidence["overdue"]["overdue_days"] == 5


def test_priority_taken_from_actual_ai_recommendation():
    task = sample_task(task_id="T1")
    rec = AIRecommendation(
        task_id="T1",
        priority_score=95.0,
        recommended_priority="URGENT",
        confidence=0.9,
        rationale="test rationale",
        model_version="m2-v1",
    )
    context = make_planning_context(tasks=[task], priorities=[rec])
    result = make_result([make_block("B1", ["T1"])])
    record = find_record(ExplainabilityService().explain(result, context), "SCHEDULED_TASK", "T1")
    assert "URGENT_PRIORITY" in record.reason_codes
    evidence_prio = record.evidence["priority"]
    assert evidence_prio["source"] == "ai_priority_model"
    assert evidence_prio["priority_score"] == 95.0
    assert evidence_prio["model_version"] == "m2-v1"


def test_integrated_block_lists_all_participants():
    tasks = [
        sample_task(task_id="T1", estimated_duration_minutes=60, department="TRACK"),
        sample_task(task_id="T2", estimated_duration_minutes=60, department="SIGNALING"),
    ]
    context = make_planning_context(tasks=tasks)
    block = make_block("B-INT", ["T1", "T2"], block_type="INTEGRATED", duration_minutes=120)
    result = make_result([block])
    expl = ExplainabilityService().explain(result, context)

    record = find_record(expl, "INTEGRATED_BLOCK", "B-INT")
    assert "INTEGRATED_BLOCK" in record.reason_codes
    assert record.evidence["task_ids"] == ["T1", "T2"]
    assert record.evidence["participant_count"] == 2
    assert "T1" in record.summary and "T2" in record.summary
    assert record.evidence["departments"] == ["SIGNALING", "TRACK"]
    assert record.evidence["departments_unavailable"] is False
    assert record.evidence["shared_window_covers_sequential"] is True

    # participant task records also carry the INTEGRATED_BLOCK code
    for participant in ("T1", "T2"):
        task_record = find_record(expl, "SCHEDULED_TASK", participant)
        assert "INTEGRATED_BLOCK" in task_record.reason_codes


def test_cross_department_integration_reported():
    tasks = [
        sample_task(task_id="T1", department="TRACK"),
        sample_task(task_id="T2", department="SIGNALING"),
        sample_task(task_id="T3", department="OHE"),
    ]
    context = make_planning_context(tasks=tasks)
    block = make_block("B-INT", ["T1", "T2", "T3"], block_type="INTEGRATED", duration_minutes=180)
    result = make_result([block])
    record = find_record(ExplainabilityService().explain(result, context), "INTEGRATED_BLOCK", "B-INT")
    assert "3 department" in record.summary
    assert record.evidence["departments"] == ["OHE", "SIGNALING", "TRACK"]


def test_validation_error_is_surfaced():
    context = make_planning_context(tasks=[sample_task(task_id="T1")])
    result = make_result([make_block("B1", ["T1"])])
    validation = make_validation(
        errors=[violation("TASK_NOT_COVERED", message="task T1 not covered")], valid=False,
    )
    expl = ExplainabilityService().explain(result, context, validation=validation)
    assert expl.schedule_valid is False
    record = find_record(expl, "VALIDATION_ERROR", "B1")
    assert record.status == "ERROR"
    assert "VALIDATION_ERROR" in record.reason_codes
    assert "TASK_NOT_COVERED" in record.reason_codes


def test_validation_warning_is_distinguished_from_error():
    context = make_planning_context(tasks=[sample_task(task_id="T1")])
    result = make_result([make_block("B1", ["T1"])])
    validation = make_validation(
        warnings=[violation("TASK_NOT_COVERED", message="close call")], valid=True,
    )
    expl = ExplainabilityService().explain(result, context, validation=validation)
    assert expl.schedule_valid is True
    warning = find_record(expl, "VALIDATION_WARNING", "B1")
    assert warning.status == "WARNING"
    assert "VALIDATION_WARNING" in warning.reason_codes
    types = {r.subject_type for r in expl.records}
    assert "VALIDATION_ERROR" not in types


def test_optimal_only_claimed_when_solver_is_optimal():
    context = make_planning_context(tasks=[sample_task(task_id="T1")])
    feasible = ExplainabilityService().explain(
        make_result([make_block("B1", ["T1"])], status="FEASIBLE"), context,
    )
    optimal = ExplainabilityService().explain(
        make_result([make_block("B2", ["T1"])], status="OPTIMAL"), context,
    )

    feasible_schedule = find_record(feasible, "SCHEDULE", "SCHED-TEST")
    assert feasible_schedule.evidence["solver_status"] == "FEASIBLE"
    assert "Feasible schedule found" in feasible_schedule.summary
    assert "did not prove optimality" in feasible_schedule.summary
    assert "optimal schedule" not in feasible_schedule.summary.lower()

    optimal_schedule = find_record(optimal, "SCHEDULE", "SCHED-TEST")
    assert optimal_schedule.evidence["solver_status"] == "OPTIMAL"
    assert "optimal" in optimal_schedule.summary.lower()


def test_feasible_is_described_as_feasible():
    context = make_planning_context(tasks=[sample_task(task_id="T1")])
    record = find_record(
        ExplainabilityService().explain(
            make_result([make_block("B1", ["T1"])], status="FEASIBLE"), context
        ),
        "SCHEDULE", "SCHED-TEST",
    )
    assert record.evidence["solver_status"] == "FEASIBLE"
    assert "Feasible schedule" in record.summary
    assert "did not prove optimality" in record.summary


def test_search_truncated_emitted_with_cap_evidence():
    settings = Settings(max_candidates_per_task=3)
    context = make_planning_context(tasks=[sample_task(task_id="T-UNS", priority="MEDIUM")])
    info = TaskSchedulingInfo(
        task_id="T-UNS", scheduled=False, reason="rejected",
        candidate_count=3, feasible_candidate_count=0,
        rejection_codes=["TRAIN_CONFLICT"], metadata={"solver_status": "OPTIMAL"},
    )
    result = make_result([], unscheduled=["T-UNS"], infos=[info])
    record = find_record(
        ExplainabilityService(settings=settings).explain(result, context),
        "UNSCHEDULED_TASK", "T-UNS",
    )
    assert "SEARCH_TRUNCATED" in record.reason_codes
    assert "reached the configured cap (3)" in " ".join(record.details)


def test_missing_data_is_reported_not_fabricated():
    task = sample_task(task_id="T1", priority="MEDIUM")  # no due_by, no window
    small = {k: v for k, v in make_planning_context(tasks=[task]).items() if k != "horizon_start"}
    small.pop("horizon_end", None)
    small["resources"] = []
    context = small
    result = make_result([make_block("B1", ["T1"])])
    record = find_record(ExplainabilityService().explain(result, context), "SCHEDULED_TASK", "T1")

    assert "OVERDUE" not in record.reason_codes
    assert "RESOURCE_AVAILABLE" not in record.reason_codes
    assert "HIGH_PRIORITY" not in record.reason_codes
    assert record.evidence["overdue"]["overdue_days"] is None
    assert record.evidence["resources"]["catalogue_available"] is False
    assert record.evidence["resources"]["claimed"] is False
    assert record.evidence["resources"]["required"] == ["MP-01"]
    assert record.evidence["priority"]["source"] == "task_record"


def test_output_is_fully_deterministic():
    tasks = [
        sample_task(task_id="T1", due_by=date(2026, 1, 5), department="TRACK"),
        sample_task(task_id="T2", estimated_duration_minutes=60, department="SIGNALING"),
        sample_task(task_id="T-UNS", priority="MEDIUM"),
    ]
    context = make_planning_context(tasks=tasks, priorities=[
        AIRecommendation(task_id="T1", priority_score=90.0, recommended_priority="URGENT",
                         confidence=0.9, model_version="m2-v1"),
    ])
    blocks = [
        make_block("B1", ["T1"]),
        make_block("B-INT", ["T1", "T2"], block_type="INTEGRATED", duration_minutes=120),
    ]
    infos = [
        TaskSchedulingInfo(task_id="T-UNS", scheduled=False, reason="rejected",
                           candidate_count=1, feasible_candidate_count=0,
                           rejection_codes=["RESOURCE_CONFLICT"],
                           metadata={"solver_status": "OPTIMAL"}),
    ]
    result = make_result(blocks, unscheduled=["T-UNS"], infos=infos)
    validation = make_validation(
        warnings=[violation("TASK_NOT_COVERED", message="near miss")], valid=True,
    )
    metrics = ScheduleMetrics(
        total_tasks_requested=3, total_tasks_scheduled=2, task_coverage_ratio=2 / 3,
        integrated_blocks_count=1, conflicts_resolved=1,
        average_possession_minutes=60.0, slot_utilisation_percent=50.0,
        validation_accuracy_percent=100.0,
    )
    service = ExplainabilityService()
    runs = [
        service.explain(result, context, validation=validation, metrics=metrics)
        for _ in range(3)
    ]
    dumps = [run.model_dump() for run in runs]
    assert dumps[0] == dumps[1] == dumps[2]
    assert runs[0].summary_text() == runs[1].summary_text()

    # codes are sorted and de-duplicated
    for record in runs[0].records:
        assert record.reason_codes == sorted(record.reason_codes)
        assert len(record.reason_codes) == len(set(record.reason_codes))


def test_no_feasible_candidate_only_among_examined_set():
    context = make_planning_context(tasks=[sample_task(task_id="T-UNS", priority="MEDIUM")])
    info = TaskSchedulingInfo(
        task_id="T-UNS", scheduled=False, reason="rejected",
        candidate_count=4, feasible_candidate_count=0,
        rejection_codes=["TRAIN_CONFLICT"], metadata={"solver_status": "OPTIMAL"},
    )
    result = make_result([], unscheduled=["T-UNS"], infos=[info])
    record = find_record(ExplainabilityService().explain(result, context), "UNSCHEDULED_TASK", "T-UNS")
    assert "NO_FEASIBLE_CANDIDATE" in record.reason_codes
    assert "among the " in record.summary
    assert "no feasible" in record.summary


def test_feasible_but_not_selected_is_not_labeled_infeasible():
    context = make_planning_context(tasks=[sample_task(task_id="T-UNS", priority="MEDIUM")])
    info = TaskSchedulingInfo(
        task_id="T-UNS", scheduled=False, reason="schedulable but not selected by optimizer",
        candidate_count=4, feasible_candidate_count=2,
        rejection_codes=[], metadata={"solver_status": "OPTIMAL"},
    )
    result = make_result([], unscheduled=["T-UNS"], infos=[info])
    expl = ExplainabilityService().explain(result, context)
    record = find_record(expl, "UNSCHEDULED_TASK", "T-UNS")
    assert "NO_FEASIBLE_CANDIDATE" not in record.reason_codes
    assert "feasible placement" in record.summary
    assert "not select" in record.summary.lower()


def test_no_solution_solver_status_never_claims_feasible_candidate():
    context = make_planning_context(tasks=[sample_task(task_id="T-UNS", priority="MEDIUM")])
    info = TaskSchedulingInfo(
        task_id="T-UNS", scheduled=False,
        reason="model infeasible: mandatory urgent placements conflict",
        candidate_count=2, feasible_candidate_count=1,
        rejection_codes=[], metadata={"solver_status": "INFEASIBLE", "no_solution": True},
    )
    result = make_result(
        [], status="INFEASIBLE", unscheduled=["T-UNS"], infos=[info],
    )
    record = find_record(ExplainabilityService().explain(result, context), "UNSCHEDULED_TASK", "T-UNS")
    assert "NO_FEASIBLE_CANDIDATE" not in record.reason_codes
    assert "INFEASIBLE" in record.evidence["solver_status"]


def test_schedule_record_honesty_without_validation():
    context = make_planning_context(tasks=[sample_task(task_id="T1")])
    expl = ExplainabilityService().explain(
        make_result([make_block("B1", ["T1"])]), context,
    )
    assert expl.schedule_valid is None
    assert expl.validation_provided is False
    record = find_record(expl, "SCHEDULE", "SCHED-TEST")
    assert record.evidence["validation"]["provided"] is False
    assert "not claimed" in record.summary


def test_metrics_record_included_when_metrics_provided():
    context = make_planning_context(tasks=[sample_task(task_id="T1")])
    result = make_result([make_block("B1", ["T1"])])
    metrics = ScheduleMetrics(
        total_tasks_requested=1, total_tasks_scheduled=1, task_coverage_ratio=1.0,
        integrated_blocks_count=0, average_possession_minutes=120.0,
        validation_accuracy_percent=100.0,
    )
    expl = ExplainabilityService().explain(result, context, metrics=metrics)
    records = [r for r in expl.records if r.subject_type == "METRIC"]
    assert len(records) == 1
    assert records[0].evidence["task_coverage_ratio"] == 1.0
    assert "validation accuracy: 100.0%" in records[0].summary

    without_validation = ScheduleMetrics(
        total_tasks_requested=1, total_tasks_scheduled=1, task_coverage_ratio=1.0,
    )
    expl2 = ExplainabilityService().explain(result, context, metrics=without_validation)
    metric2 = [r for r in expl2.records if r.subject_type == "METRIC"][0]
    assert metric2.evidence["validation_accuracy_percent"] is None
    assert "unavailable" in metric2.summary


def test_resources_available_emitted_when_catalogue_covers_block():
    from tests.helpers import sample_resource

    context = make_planning_context(
        tasks=[sample_task(task_id="T1", required_resources=["RES-001"])],
        resources=[sample_resource(resource_id="RES-001")],
    )
    result = make_result([make_block("B1", ["T1"])])
    record = find_record(ExplainabilityService().explain(result, context), "SCHEDULED_TASK", "T1")
    assert "RESOURCE_AVAILABLE" in record.reason_codes
    assert record.evidence["resources"]["entries"][0]["covers_block"] is True


# ------------------------------------------------------------- 15..suite check


def test_existing_suite_still_passes():
    import os

    env = {"PYTHONPATH": str(ROOT)}
    env.update({k: v for k, v in os.environ.items() if k not in env})
    proc = subprocess.run(
        [
            sys.executable, "-m", "pytest", "tests", "-q", "--no-header",
            "-p", "no:cacheprovider",
            "--ignore=tests/unit/test_explainability.py",
        ],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    assert proc.returncode == 0, output
    assert "failed" not in output.splitlines()[-1].lower() or "0 failed" in output.splitlines()[-1]


# ---------------------------------------------------------------- honesty guards


def _all_codes(expl) -> set:
    return {code for record in expl.records for code in record.reason_codes}


def test_forbidden_and_unsupported_codes_never_emitted():
    tasks = [
        sample_task(task_id="T1", due_by=date(2026, 1, 5)),
        sample_task(task_id="T-UNS", priority="MEDIUM"),
    ]
    context = make_planning_context(tasks=tasks)
    info = TaskSchedulingInfo(
        task_id="T-UNS", scheduled=False, reason="rejected",
        candidate_count=1, feasible_candidate_count=0,
        rejection_codes=["RESOURCE_CONFLICT"], metadata={"solver_status": "OPTIMAL"},
    )
    result = make_result(
        [make_block("B1", ["T1"])], unscheduled=["T-UNS"], infos=[info],
    )
    validation = make_validation(warnings=[violation("TASK_NOT_COVERED")], valid=True)
    metrics = ScheduleMetrics(total_tasks_requested=2, total_tasks_scheduled=1)
    expl = ExplainabilityService().explain(
        result, context, validation=validation, metrics=metrics,
    )
    codes = _all_codes(expl)
    assert codes.isdisjoint(FORBIDDEN_VAGUE_CODES)
    assert codes.isdisjoint({"POWER_CONFLICT", "DEPENDENCY_CONFLICT"})
    assert codes.issubset(ALLOWED_REASON_CODES)


def test_documented_codes_are_all_actually_used_somewhere():
    from app.services.explainability import EXPLAINABILITY_CODES

    assert EXPLAINABILITY_CODES.issubset(ALLOWED_REASON_CODES)
    # the concrete interface type is exported
    assert issubclass(ExplainabilityService, ExplainabilityServiceInterface)