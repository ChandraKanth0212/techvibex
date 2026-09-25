"""Deterministic, evidence-based schedule explainability (Phase 6).

Implements the :class:`app.services.ExplainabilityService` interface for a
:class:`ScheduleResult`, attaching human-readable, machine-readable reasoning to
every part of a produced schedule — WITHOUT an LLM and never by asking the
consumer models to "explain themselves".

Honesty doctrine — an explanation may only ever restate what the structured
inputs actually evidence:

- reason codes reuse the existing vocabularies first (engine
  ``ConflictCode`` values, Phase 4 validator report codes) and add a small,
  documented set of explainability codes. Vague "AI decision" codes
  (``AI_DECISION``, ``SMART_CHOICE``, ``OPTIMAL_CHOICE``) are never emitted;
- the solver status is reported verbatim: only an ``OPTIMAL`` result may be
  described as optimal, ``FEASIBLE`` is described as feasible with optimality
  not proven, and ``INFEASIBLE`` / ``ERROR`` / ``UNKNOWN`` never produce a
  schedule that claims validity;
- schedule validity comes ONLY from an independent
  :class:`ScheduleValidationResult`; without it ``schedule_valid`` stays
  ``None`` and the explanation says so;
- "no feasible candidate" is only asserted among the examined candidate set —
  never a global claim of impossibility. When candidate enumeration reached the
  configured cap (or integrated groups were not exhaustive) ``SEARCH_TRUNCATED``
  is emitted so the reader knows the examined set may be incomplete;
- optional data that is missing (priority recommendations, due dates, resource
  catalogue entries, departments, candidate detail) is reported as
  unavailable, never invented. ``POWER_CONFLICT`` and ``DEPENDENCY_CONFLICT``
  remain unsupported and are never emitted.

Determinism: identical inputs + configuration yield identical records in
identical order. All iterations, codes and evidence lists are sorted before
emission.

Reason code vocabulary:

- Reused engine codes: ``SUPPORTED_CONFLICT_CODES`` (8 codes).
- Reused Phase 4 validator codes: ``UNKNOWN_TASK``, ``DUPLICATE_TASK``,
  ``TASK_NOT_COVERED``, ``SCHEDULE_INCONSISTENT``, ``NO_SOLUTION``.
- Explainability codes (this module): ``SCHEDULED``, ``UNSCHEDULED``,
  ``NO_FEASIBLE_CANDIDATE``, ``SEARCH_TRUNCATED``, ``HIGH_PRIORITY``,
  ``URGENT_PRIORITY``, ``OVERDUE``, ``INTEGRATED_BLOCK``,
  ``RESOURCE_AVAILABLE``, ``FEASIBLE_WINDOW``, ``VALIDATION_WARNING``,
  ``VALIDATION_ERROR``. (``CRITICAL_PRIORITY`` is not in the vocabulary because
  ``PriorityLevel`` has no CRITICAL level — see ``contracts/enums.py``.)
"""

from datetime import date, datetime

from app.core.config import Settings, get_settings
from app.core.context import PlanningContext
from app.constraints.codes import SUPPORTED_CONFLICT_CODES
from app.services import ExplainabilityService as ExplainabilityServiceInterface
from contracts import (
    BlockCandidate,
    ConstraintViolation,
    ExplainabilityResult,
    ExplanationRecord,
    IntegratedBlockCandidate,
    ScheduleMetrics,
    ScheduleResult,
    ScheduleValidationResult,
    TaskSchedulingInfo,
)

# ---------------------------------------------------------------- vocabularies

REUSED_CONFLICT_CODES = frozenset(SUPPORTED_CONFLICT_CODES)
REUSED_VALIDATOR_CODES = frozenset(
    {"UNKNOWN_TASK", "DUPLICATE_TASK", "TASK_NOT_COVERED", "SCHEDULE_INCONSISTENT", "NO_SOLUTION"}
)

SCHEDULED = "SCHEDULED"
UNSCHEDULED = "UNSCHEDULED"
NO_FEASIBLE_CANDIDATE = "NO_FEASIBLE_CANDIDATE"
SEARCH_TRUNCATED = "SEARCH_TRUNCATED"
HIGH_PRIORITY = "HIGH_PRIORITY"
URGENT_PRIORITY = "URGENT_PRIORITY"
OVERDUE = "OVERDUE"
INTEGRATED_BLOCK = "INTEGRATED_BLOCK"
RESOURCE_AVAILABLE = "RESOURCE_AVAILABLE"
FEASIBLE_WINDOW = "FEASIBLE_WINDOW"
VALIDATION_WARNING = "VALIDATION_WARNING"
VALIDATION_ERROR = "VALIDATION_ERROR"

EXPLAINABILITY_CODES = frozenset(
    {
        SCHEDULED,
        UNSCHEDULED,
        NO_FEASIBLE_CANDIDATE,
        SEARCH_TRUNCATED,
        HIGH_PRIORITY,
        URGENT_PRIORITY,
        OVERDUE,
        INTEGRATED_BLOCK,
        RESOURCE_AVAILABLE,
        FEASIBLE_WINDOW,
        VALIDATION_WARNING,
        VALIDATION_ERROR,
    }
)

ALLOWED_REASON_CODES = REUSED_CONFLICT_CODES | REUSED_VALIDATOR_CODES | EXPLAINABILITY_CODES

#: Codes never emitted, no matter the input (kept for test-side assertions).
FORBIDDEN_VAGUE_CODES = frozenset({"AI_DECISION", "SMART_CHOICE", "OPTIMAL_CHOICE"})

_SOLVER_STATUS_TEXT = {
    "OPTIMAL": "Schedule found to be optimal by the CP-SAT solver",
    "FEASIBLE": "Feasible schedule found; the solver did not prove optimality",
    "INFEASIBLE": "No schedule satisfies all hard constraints",
    "ERROR": "The solver reported a model error and produced no schedule",
    "UNKNOWN": "The solver stopped without a solution",
}

_SOLVER_NO_SOLUTION_STATUSES = frozenset({"INFEASIBLE", "ERROR", "UNKNOWN"})

_HORIZON_ANCHOR_MISSING = "horizon anchor date not provided; overdue cannot be judged"

#: Solver metadata keys that measure this particular run (wall-clock) and would
#: break the determinism contract if copy-pasted into an explanation.
_NON_DETERMINISTIC_METADATA_KEYS = frozenset(
    {
        "solve_time_seconds",
        "presolve_solve_time_seconds",
        "wall_time_seconds",
        "runtime_seconds",
    }
)


def _stable_metadata(metadata) -> dict:
    """Return solver metadata with run-timing keys removed (determinism)."""
    if not metadata:
        return {}
    return {
        key: value
        for key, value in metadata.items()
        if key not in _NON_DETERMINISTIC_METADATA_KEYS
    }


def _sorted_unique(values) -> list[str]:
    return sorted({str(value) for value in values})


def _prio_value(prio) -> str:
    return getattr(prio, "value", prio)


class ExplainabilityService(ExplainabilityServiceInterface):
    """Deterministically explains schedules from structured evidence only."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def settings(self) -> Settings:
        return self._settings

    # -------------------------------------------------------- public contract

    def explain(
        self,
        result: ScheduleResult,
        context,
        validation: ScheduleValidationResult | None = None,
        metrics: ScheduleMetrics | None = None,
        candidates: list[BlockCandidate | IntegratedBlockCandidate] | None = None,
    ) -> ExplainabilityResult:
        if isinstance(result, dict):
            result = ScheduleResult.model_validate(result)
        ctx = self._context(context)
        validation = self._coerce_validation(validation)
        metrics = self._coerce_metrics(metrics)

        task_lookup = {task.task_id: task for task in ctx.tasks}
        ai_recs = {rec.task_id: rec for rec in ctx.priorities}
        resource_lookup = {resource.resource_id: resource for resource in ctx.resources}

        singles, integrated = self._split_candidates(candidates)
        single_by_task = self._group_singles(singles)

        blocks = sorted(result.selected_blocks or [], key=lambda b: b.block_id)

        records: list[ExplanationRecord] = []
        records.append(self._schedule_record(result, validation, metrics))
        records.extend(
            self._scheduled_records(
                result, ctx, task_lookup, ai_recs, resource_lookup, blocks,
            )
        )
        records.extend(
            self._unscheduled_records(
                result, ctx, task_lookup, ai_recs, single_by_task,
            )
        )
        records.extend(
            self._integrated_records(
                result, task_lookup, blocks, integrated,
            )
        )
        if validation is not None:
            records.extend(self._validation_records(result, validation))
        if metrics is not None:
            records.extend(self._metrics_records(result, metrics))

        records.sort(key=lambda r: (r.subject_type, r.subject_id, r.summary))

        return ExplainabilityResult(
            schedule_id=result.schedule_id,
            solver_status=result.status,
            schedule_valid=(
                validation.valid if validation is not None else None
            ),
            validation_provided=validation is not None,
            records=records,
            metadata={
                "metrics_provided": metrics is not None,
                "candidates_provided": bool(singles or integrated),
                "reason_code_vocabulary": sorted(ALLOWED_REASON_CODES),
            },
        )

    # ---------------------------------------------------------------- schedule

    def _schedule_record(self, result, validation, metrics) -> ExplanationRecord:
        text = _SOLVER_STATUS_TEXT.get(result.status, f"Solver status {result.status}")
        lines = [f"{result.schedule_id}: {text}."]
        if result.message:
            lines.append(result.message.rstrip(".") + ".")
        if validation is None:
            lines.append(
                "Independent validation was not supplied; validity is not claimed."
            )
        elif validation.valid:
            lines.append(
                f"Independent validation found no errors "
                f"({len(validation.warnings)} warning(s))."
            )
        else:
            lines.append(
                f"Independent validation found {len(validation.errors)} error(s) "
                f"and {len(validation.warnings)} warning(s)."
            )
        if metrics is not None:
            lines.append(
                f"Metrics: {metrics.total_tasks_scheduled}/{metrics.total_tasks_requested} "
                f"tasks scheduled ({metrics.task_coverage_ratio:.0%})."
            )
        evidence = {
            "schedule_id": result.schedule_id,
            "solver_status": result.status,
            "objective_value": result.objective_value,
            "selected_block_count": len(result.selected_blocks or []),
            "scheduled_task_count": len(result.scheduled_task_ids or []),
            "unscheduled_task_count": len(result.unscheduled_task_ids or []),
            "validation": self._validation_evidence(validation),
            "metrics": {"provided": metrics is not None},
        }
        return ExplanationRecord(
            subject_type="SCHEDULE",
            subject_id=result.schedule_id,
            status=result.status,
            reason_codes=[],
            summary=" ".join(lines),
            details=lines,
            evidence=evidence,
            metadata={"message": result.message},
        )

    @staticmethod
    def _validation_evidence(validation) -> dict:
        if validation is None:
            return {"provided": False, "valid": None}
        return {
            "provided": True,
            "valid": validation.valid,
            "error_count": len(validation.errors),
            "warning_count": len(validation.warnings),
            "checked_block_count": validation.checked_block_count,
            "checked_task_count": validation.checked_task_count,
        }

    # -------------------------------------------------------- scheduled tasks

    def _scheduled_records(
        self,
        result,
        ctx: PlanningContext,
        task_lookup: dict,
        ai_recs: dict,
        resource_lookup: dict,
        blocks: list,
    ) -> list[ExplanationRecord]:
        records: list[ExplanationRecord] = []
        scheduled_ids = sorted(set(result.scheduled_task_ids or []))
        block_ids = sorted({block.block_id for block in blocks})
        for task_id in scheduled_ids:
            blocks_for = [block for block in blocks if task_id in block.task_ids]
            primary = min(blocks_for, key=lambda b: b.block_id) if blocks_for else None
            task = task_lookup.get(task_id)
            codes = [SCHEDULED]
            details: list[str] = []
            evidence = {"task_id": task_id, "solver_status": result.status}

            if primary is None:
                codes.append("SCHEDULE_INCONSISTENT")
                summary = (
                    f"{task_id} is listed as scheduled but appears in no selected "
                    f"block; the schedule is internally inconsistent."
                )
                details.append(summary)
                evidence.update(
                    {
                        "block_id": None,
                        "block_ids_none_match": block_ids,
                        "task_details": self._task_details(task),
                    }
                )
                records.append(self._task_record(
                    subject_type="SCHEDULED_TASK", subject_id=task_id,
                    status="SCHEDULED", codes=codes, summary=summary,
                    details=details, evidence=evidence,
                ))
                continue

            block = primary
            other_blocks = [b.block_id for b in blocks_for if b.block_id != block.block_id]
            priority_bits = self._priority_evidence(task_id, task, ai_recs)
            overdue_bits = self._overdue_evidence(task, ctx)
            resource_bits = self._resource_evidence(task, resource_lookup, block)

            if priority_bits["level"] == "HIGH":
                codes.append(HIGH_PRIORITY)
            elif priority_bits["level"] == "URGENT":
                codes.append(URGENT_PRIORITY)
            if overdue_bits["overdue"]:
                codes.append(OVERDUE)
            if resource_bits["all_available"]:
                codes.append(RESOURCE_AVAILABLE)
            if block.block_type == "INTEGRATED":
                codes.append(INTEGRATED_BLOCK)

            window_bits = self._window_evidence(task, ctx, block)
            if window_bits["feasible"]:
                codes.append(FEASIBLE_WINDOW)

            summary_parts = [
                f"{task_id} scheduled in block {block.block_id} "
                f"({block.block_type.lower()}) on {block.corridor_id}/{block.section} "
                f"{self._fmt(block.start_time)} to {self._fmt(block.end_time)} "
                f"({block.total_duration_minutes} minutes)."
            ]
            summary_parts.append(
                f"Priority {priority_bits['level']} ({priority_bits['source']})."
            )
            if overdue_bits["overdue"]:
                summary_parts.append(
                    f"Overdue by {overdue_bits['overdue_days']} day(s) relative to "
                    f"the horizon anchor {self._fmt_date(overdue_bits['anchor'])}."
                )
            if block.block_type == "INTEGRATED":
                other = sorted(t for t in block.task_ids if t != task_id)
                summary_parts.append(
                    f"Scheduled inside an integrated block with: {', '.join(other) or 'n/a'}."
                )
            if resource_bits["all_available"]:
                summary_parts.append(
                    "All required resources verified available."
                )

            evidence.update(
                {
                    "block_id": block.block_id,
                    "block_type": block.block_type,
                    "corridor_id": block.corridor_id,
                    "section": block.section,
                    "start_time": block.start_time,
                    "end_time": block.end_time,
                    "total_duration_minutes": block.total_duration_minutes,
                    "objective_contribution": block.objective_contribution,
                    "source_candidate_ids": sorted(block.source_candidate_ids),
                    "also_in_blocks": other_blocks,
                    "priority": priority_bits["evidence"],
                    "overdue": overdue_bits["evidence"],
                    "window": window_bits["evidence"],
                    "resources": resource_bits["evidence"],
                    "task_details": self._task_details(task),
                    "solver_metadata": _stable_metadata(result.solver_metadata),
                }
            )
            details.extend(self._scheduled_details(task_id, block, priority_bits, overdue_bits, resource_bits, window_bits))

            records.append(self._task_record(
                subject_type="SCHEDULED_TASK", subject_id=task_id,
                status="SCHEDULED", codes=codes, summary=" ".join(summary_parts),
                details=details, evidence=evidence,
            ))
        return records

    def _scheduled_details(self, task_id, block, priority_bits, overdue_bits, resource_bits, window_bits) -> list[str]:
        lines = [
            f"placed in {block.block_type.lower()} block {block.block_id} on "
            f"{block.corridor_id}/{block.section}",
            f"window {self._fmt(block.start_time)} to {self._fmt(block.end_time)} "
            f"({block.total_duration_minutes} minutes)",
        ]
        lines.append(
            f"priority {priority_bits['level']} sourced from {priority_bits['source']}"
        )
        if overdue_bits["overdue"]:
            lines.append(
                f"overdue by {overdue_bits['overdue_days']} day(s) (due "
                f"{self._fmt_date(overdue_bits.get('due_by'))})"
            )
        elif not overdue_bits["judged"]:
            lines.append(_HORIZON_ANCHOR_MISSING)
        lines.append(window_bits["detail"])
        lines.append(resource_bits["detail"])
        return lines

    # ------------------------------------------------------ unscheduled tasks

    def _unscheduled_records(
        self,
        result,
        ctx: PlanningContext,
        task_lookup: dict,
        ai_recs: dict,
        single_by_task: dict,
    ) -> list[ExplanationRecord]:
        info_lookup = {info.task_id: info for info in (result.unscheduled_tasks or [])}
        unscheduled_ids = sorted(
            set(result.unscheduled_task_ids or []) | set(info_lookup)
        )
        records: list[ExplanationRecord] = []
        for task_id in unscheduled_ids:
            info = info_lookup.get(task_id)
            task = task_lookup.get(task_id)
            codes = [UNSCHEDULED]
            evidence = {
                "task_id": task_id,
                "solver_status": result.status,
                "task_details": self._task_details(task),
            }
            details: list[str] = []

            if info is not None:
                evidence.update(self._info_evidence(info))
                codes.extend(sorted(info.rejection_codes))
                detail_lines, code_additions = self._candidate_explanation(
                    info, result.status,
                )
                details.extend(detail_lines)
                codes.extend(code_additions)

            priority_bits = self._priority_evidence(task_id, task, ai_recs)
            overdue_bits = self._overdue_evidence(task, ctx)
            if priority_bits["level"] == "HIGH":
                codes.append(HIGH_PRIORITY)
            elif priority_bits["level"] == "URGENT":
                codes.append(URGENT_PRIORITY)
            if overdue_bits["overdue"]:
                codes.append(OVERDUE)
            evidence["priority"] = priority_bits["evidence"]
            evidence["overdue"] = overdue_bits["evidence"]

            if result.status in _SOLVER_NO_SOLUTION_STATUSES:
                details.append(
                    f"solver status {result.status}: the model produced no "
                    f"solution, so no placement for {task_id} exists to examine."
                )
            # candidate detail (against the full examined set) when supplied
            cands = single_by_task.get(task_id, [])
            if cands:
                evidence["candidate_detail"] = self._candidate_detail(cands, self._settings.max_candidates_per_task)
            else:
                evidence["candidate_detail"] = {"provided": False}

            summary_parts = [f"{task_id} was not scheduled."]
            if info is not None and info.reason:
                summary_parts.append(info.reason.rstrip(".") + ".")
            if self._no_solution(result.status):
                summary_parts.append(f"Solver status {result.status}: no solution produced.")
            elif info is not None and info.candidate_count == 0:
                summary_parts.append(
                    "No candidate placements were generated for this task, "
                    "so no feasible placement can be asserted."
                )
            elif info is not None and info.feasible_candidate_count == 0:
                summary_parts.append(
                    f"All {info.candidate_count} examined candidate placement(s) were "
                    "rejected by hard constraints (no feasible candidate among the "
                    "examined set)."
                )
            elif info is not None and info.feasible_candidate_count > 0:
                summary_parts.append(
                    f"{info.feasible_candidate_count} feasible placement(s) existed "
                    "but the solver did not select one."
                )
            if SEARCH_TRUNCATED in codes:
                summary_parts.append(
                    "Candidate enumeration reached the configured cap; feasibility "
                    "beyond the examined set is not asserted."
                )

            records.append(self._task_record(
                subject_type="UNSCHEDULED_TASK", subject_id=task_id,
                status="UNSCHEDULED", codes=codes, summary=" ".join(summary_parts),
                details=details, evidence=evidence,
            ))
        return records

    def _candidate_explanation(self, info, status: str):
        details: list[str] = []
        code_additions: list[str] = []
        if status in _SOLVER_NO_SOLUTION_STATUSES:
            return details, code_additions
        if info.candidate_count == 0:
            details.append(
                "candidate generation produced no placements; no feasibility "
                "claim is possible."
            )
            return details, code_additions
        if info.feasible_candidate_count == 0:
            codes = ", ".join(sorted(info.rejection_codes)) or "hard constraints"
            details.append(
                f"{info.candidate_count} candidate placement(s) examined; all "
                f"rejected ({codes})."
            )
            code_additions.append(NO_FEASIBLE_CANDIDATE)
        else:
            details.append(
                f"{info.feasible_candidate_count} of {info.candidate_count} "
                "examined candidate placement(s) were feasible, but none was selected."
            )
        if info.candidate_count >= self._settings.max_candidates_per_task:
            details.append(
                f"candidate enumeration reached the configured cap "
                f"({self._settings.max_candidates_per_task}); the examined set "
                "may be incomplete."
            )
            code_additions.append(SEARCH_TRUNCATED)
        return details, code_additions

    # -------------------------------------------------------- integrated blocks

    def _integrated_records(
        self,
        result,
        task_lookup: dict,
        blocks: list,
        integrated_candidates: list[IntegratedBlockCandidate],
    ) -> list[ExplanationRecord]:
        records: list[ExplanationRecord] = []
        integrated_by_block = {c.block_id: c for c in integrated_candidates}
        for block in sorted(blocks, key=lambda b: b.block_id):
            if block.block_type != "INTEGRATED":
                continue
            task_ids = sorted(set(block.task_ids))
            tasks = [task_lookup[t] for t in task_ids if t in task_lookup]
            missing = sorted(set(task_ids) - set(task_lookup))
            departments = sorted(
                {t.department for t in tasks if t.department is not None}
            )
            work_types = sorted({t.work_type for t in tasks})
            sequential = sum(
                t.estimated_duration_minutes for t in tasks
            )
            shared = block.total_duration_minutes
            fits = sequential is not None and sequential <= shared

            codes = [INTEGRATED_BLOCK]
            candidate = integrated_by_block.get(block.block_id)
            if candidate is not None and not candidate.metadata.get("candidate_search_exhausted", True):
                codes.append(SEARCH_TRUNCATED)

            summary_parts = [
                f"Integrated block {block.block_id} schedules "
                f"{len(task_ids)} task(s) ({', '.join(task_ids)}) sharing one "
                f"possession of {shared} minutes on {block.corridor_id}/{block.section} "
                f"from {self._fmt(block.start_time)} to {self._fmt(block.end_time)}.",
            ]
            if departments:
                summary_parts.append(
                    f"Participants span {len(departments)} department(s): "
                    f"{', '.join(departments)}."
                )
            summary_parts.append(
                f"Sequential work totals {sequential} minute(s); the shared "
                f"window {('covers' if fits else 'does not cover')} it."
            )

            evidence = {
                "block_id": block.block_id,
                "corridor_id": block.corridor_id,
                "section": block.section,
                "start_time": block.start_time,
                "end_time": block.end_time,
                "shared_possession_minutes": shared,
                "task_ids": task_ids,
                "participant_count": len(task_ids),
                "departments": departments,
                "departments_unavailable": len(departments) == 0,
                "work_types": work_types,
                "sequential_duration_minutes": sequential,
                "shared_window_covers_sequential": fits,
                "tasks_missing_from_context": missing,
                "objective_contribution": block.objective_contribution,
                "source_candidate_ids": sorted(block.source_candidate_ids),
                "solver_status": result.status,
            }
            details = [
                f"shared possession {self._fmt(block.start_time)} to "
                f"{self._fmt(block.end_time)} ({shared} minutes)",
                f"sequential task work totals {sequential} minutes "
                f"({'fits' if fits else 'does NOT fit'} within the shared window)",
                f"participating departments: {', '.join(departments) or 'unavailable'}",
                f"participants: {', '.join(task_ids)}",
            ]
            if candidate is not None:
                search_exhausted = candidate.metadata.get("candidate_search_exhausted", True)
                groups_exhaustive = candidate.metadata.get("groups_exhaustive", True)
                evidence["compatibility"] = candidate.compatibility.value
                evidence["placements_examined"] = candidate.metadata.get("placements_examined")
                evidence["placements_total"] = candidate.metadata.get("placements_total")
                evidence["candidate_search_exhausted"] = search_exhausted
                evidence["groups_exhaustive"] = groups_exhaustive
                details.append(
                    f"integrated candidate compatibility {candidate.compatibility.value}; "
                    f"candidate search exhausted={search_exhausted}, "
                    f"groups exhaustive={groups_exhaustive}"
                )

            records.append(self._task_record(
                subject_type="INTEGRATED_BLOCK", subject_id=block.block_id,
                status="SCHEDULED", codes=codes, summary=" ".join(summary_parts),
                details=details, evidence=evidence,
            ))
        return records

    # --------------------------------------------------------------- validation

    def _validation_records(self, result, validation) -> list[ExplanationRecord]:
        records: list[ExplanationRecord] = []
        subject = result.schedule_id
        for violation in self._sorted_violations(validation.errors):
            records.append(self._violation_record(
                subject_type="VALIDATION_ERROR", status="ERROR",
                subject_id=violation.block_id or subject,
                code=VALIDATION_ERROR, violation=violation,
            ))
        for violation in self._sorted_violations(validation.warnings):
            records.append(self._violation_record(
                subject_type="VALIDATION_WARNING", status="WARNING",
                subject_id=violation.block_id or subject,
                code=VALIDATION_WARNING, violation=violation,
            ))
        return records

    @staticmethod
    def _sorted_violations(violations) -> list:
        return sorted(
            violations,
            key=lambda v: (v.violation_code, v.block_id or "", tuple(v.affected_ids), v.message),
        )

    def _violation_record(self, subject_type, status, subject_id, code, violation: ConstraintViolation) -> ExplanationRecord:
        summary = f"{violation.violation_code}: {violation.message or violation.reason or 'validation issue'}."
        details = [line for line in (violation.message, violation.reason) if line]
        return ExplanationRecord(
            subject_type=subject_type,
            subject_id=subject_id,
            status=status,
            reason_codes=_sorted_unique([code, violation.violation_code]),
            summary=summary,
            details=details,
            evidence={
                "schedule_id": None,
                "violation_code": violation.violation_code,
                "constraint_name": violation.constraint_name,
                "severity": violation.severity.value,
                "block_id": violation.block_id,
                "affected_ids": sorted(violation.affected_ids),
                "reason": violation.reason,
                "message": violation.message,
            },
            metadata={},
        )

    # ------------------------------------------------------------------ metrics

    def _metrics_records(self, result, metrics: ScheduleMetrics) -> list[ExplanationRecord]:
        lines = [
            f"tasks: {metrics.total_tasks_scheduled}/{metrics.total_tasks_requested} "
            f"scheduled (coverage {metrics.task_coverage_ratio:.0%})",
            f"integrated blocks: {metrics.integrated_blocks_count}",
            f"consolidation: {metrics.block_consolidation_ratio:.2f} tasks per block",
            f"average possession: {metrics.average_possession_minutes:.1f} minutes",
            f"resource utilisation: {metrics.resource_utilisation_percent:.1f}%",
            f"urgent: {metrics.scheduled_urgent_tasks} scheduled / "
            f"{metrics.unscheduled_urgent_tasks} unscheduled",
            f"conflicts honoured: {metrics.conflicts_resolved}",
        ]
        if metrics.validation_accuracy_percent is None:
            lines.append(
                "validation accuracy unavailable: no independent validation result supplied"
            )
        else:
            lines.append(
                f"validation accuracy: {metrics.validation_accuracy_percent:.1f}%"
            )
        evidence = {
            "schedule_id": result.schedule_id,
            "total_tasks_requested": metrics.total_tasks_requested,
            "total_tasks_scheduled": metrics.total_tasks_scheduled,
            "task_coverage_ratio": metrics.task_coverage_ratio,
            "integrated_blocks_count": metrics.integrated_blocks_count,
            "conflicts_resolved": metrics.conflicts_resolved,
            "average_possession_minutes": metrics.average_possession_minutes,
            "slot_utilisation_percent": metrics.slot_utilisation_percent,
            "block_consolidation_ratio": metrics.block_consolidation_ratio,
            "resource_utilisation_percent": metrics.resource_utilisation_percent,
            "scheduled_urgent_tasks": metrics.scheduled_urgent_tasks,
            "unscheduled_urgent_tasks": metrics.unscheduled_urgent_tasks,
            "validation_accuracy_percent": metrics.validation_accuracy_percent,
        }
        return [
            ExplanationRecord(
                subject_type="METRIC",
                subject_id=result.schedule_id,
                status="METRIC",
                reason_codes=[],
                summary="; ".join(lines),
                details=lines,
                evidence=evidence,
                metadata={"schedule_id": result.schedule_id},
            )
        ]

    # ----------------------------------------------------------------- evidence

    def _priority_evidence(self, task_id: str, task, ai_recs: dict) -> dict:
        rec = ai_recs.get(task_id)
        if rec is not None:
            return {
                "level": _prio_value(rec.recommended_priority),
                "source": "ai_priority_model",
                "evidence": {
                    "source": "ai_priority_model",
                    "priority": _prio_value(rec.recommended_priority),
                    "priority_score": rec.priority_score,
                    "confidence": rec.confidence,
                    "model_version": rec.model_version,
                    "rationale": rec.rationale,
                },
            }
        if task is not None:
            return {
                "level": _prio_value(task.priority),
                "source": "task_record",
                "evidence": {
                    "source": "task_record",
                    "priority": _prio_value(task.priority),
                },
            }
        return {
            "level": None,
            "source": "unavailable",
            "evidence": {"source": "unavailable", "priority": None},
        }

    def _overdue_evidence(self, task, ctx: PlanningContext) -> dict:
        if task is None or task.due_by is None or ctx.horizon_start is None:
            due_by = task.due_by if task is not None else None
            return {
                "overdue": False,
                "judged": False,
                "due_by": due_by,
                "anchor": None,
                "overdue_days": None,
                "evidence": {
                    "due_by": self._fmt_date(due_by) if due_by is not None else None,
                    "horizon_anchor": None,
                    "overdue_days": None,
                    "overdue": False,
                    "judged": False,
                },
            }
        days = (ctx.horizon_start.date() - task.due_by).days
        return {
            "overdue": days > 0,
            "judged": True,
            "due_by": task.due_by,
            "anchor": ctx.horizon_start.date(),
            "overdue_days": days if days > 0 else 0,
            "evidence": {
                "due_by": self._fmt_date(task.due_by),
                "horizon_anchor": self._fmt_date(ctx.horizon_start.date()),
                "overdue_days": days if days > 0 else 0,
                "overdue": days > 0,
            },
        }

    def _resource_evidence(self, task, resource_lookup: dict, block) -> dict:
        ids = sorted(task.required_resources or []) if task is not None else []
        if not ids:
            return {
                "all_available": False,
                "judged": True,
                "evidence": {"required": [], "checked": True, "claimed": False},
                "detail": "no required resources declared on the task",
            }
        if not resource_lookup:
            return {
                "all_available": False,
                "judged": True,
                "evidence": {
                    "required": ids,
                    "catalogue_available": False,
                    "claimed": False,
                },
                "detail": "resource catalogue is empty; availability cannot be verified",
            }
        entries = []
        missing = []
        for resource_id in ids:
            res = resource_lookup.get(resource_id)
            if res is None:
                missing.append(resource_id)
                continue
            window_ok = True
            if res.available_from is not None and block.end_time < res.available_from:
                window_ok = False
            if res.available_until is not None and block.start_time > res.available_until:
                window_ok = False
            entries.append(
                {
                    "resource_id": res.resource_id,
                    "capacity": res.capacity,
                    "available_from": res.available_from,
                    "available_until": res.available_until,
                    "covers_block": window_ok,
                }
            )
        all_available = not missing and all(entry["covers_block"] for entry in entries)
        return {
            "all_available": all_available,
            "judged": True,
            "evidence": {
                "required": ids,
                "catalogue_available": True,
                "missing": sorted(missing),
                "entries": entries,
                "claimed": all_available,
            },
            "detail": (
                "all required resources verified available for the block window"
                if all_available
                else (
                    f"some required resources unavailable or missing: "
                    f"{', '.join(sorted(missing) + [e['resource_id'] for e in entries if not e['covers_block']])}"
                )
            ),
        }

    def _window_evidence(self, task, ctx: PlanningContext, block) -> dict:
        window = None
        source = None
        if task is not None and task.window_start is not None and task.window_end is not None:
            window = (task.window_start, task.window_end)
            source = "task_window"
        else:
            for req in ctx.block_requests:
                if task is not None and task.task_id in req.task_ids:
                    window = (req.requested_start, req.requested_end)
                    source = "block_request"
                    break
        if window is None and ctx.horizon_start is not None and ctx.horizon_end is not None:
            window = (ctx.horizon_start, ctx.horizon_end)
            source = "planning_horizon"
        if window is None:
            return {
                "feasible": False,
                "judged": False,
                "evidence": {"source": "unavailable", "window": None},
                "detail": "no availability window declared for the task or context; feasibility window not claimed",
            }
        ws, we = window
        feasible = ws <= block.start_time and block.end_time <= we
        return {
            "feasible": feasible,
            "judged": True,
            "evidence": {
                "source": source,
                "window_start": ws,
                "window_end": we,
                "placed_start": block.start_time,
                "placed_end": block.end_time,
                "within_window": feasible,
            },
            "detail": f"placement {self._fmt(block.start_time)} to {self._fmt(block.end_time)} "
                      f"{'fits' if feasible else 'exceeds'} the {source} window",
        }

    @staticmethod
    def _task_details(task) -> dict:
        if task is None:
            return {"provided": False}
        return {
            "provided": True,
            "task_id": task.task_id,
            "work_type": _prio_value(task.work_type),
            "priority": _prio_value(task.priority),
            "department": task.department,
            "estimated_duration_minutes": task.estimated_duration_minutes,
            "due_by": task.due_by,
            "required_resources": sorted(task.required_resources),
        }

    @staticmethod
    def _info_evidence(info: TaskSchedulingInfo) -> dict:
        return {
            "reason": info.reason,
            "candidate_count": info.candidate_count,
            "feasible_candidate_count": info.feasible_candidate_count,
            "rejection_codes": sorted(info.rejection_codes),
            "info_metadata": dict(info.metadata),
        }

    def _candidate_detail(self, candidates, cap: int) -> dict:
        examined = len(candidates)
        feasible = [c for c in candidates if c.rejected is not True]
        rejected = [c for c in candidates if c.rejected]
        return {
            "provided": True,
            "examined_count": examined,
            "feasible_count": len(feasible),
            "rejected_count": len(rejected),
            "cap": cap,
            "truncated": examined >= cap,
            "rejected_candidates": [
                {
                    "candidate_id": c.candidate_id,
                    "start_time": c.start_time,
                    "end_time": c.end_time,
                    "rejection_codes": sorted(c.rejection_codes),
                    "violations": [
                        {
                            "code": v.violation_code,
                            "severity": v.severity.value,
                            "message": v.message,
                            "affected_ids": sorted(v.affected_ids),
                            "reason": v.reason,
                        }
                        for v in sorted(c.violations, key=lambda v: v.violation_code)
                    ],
                }
                for c in sorted(rejected, key=lambda c: c.candidate_id)
            ],
        }

    # ------------------------------------------------------------------ helpers

    @staticmethod
    def _context(context) -> PlanningContext:
        if isinstance(context, PlanningContext):
            raw = context.model_dump()
        elif hasattr(context, "model_dump"):
            raw = context.model_dump()
        else:
            raw = dict(context or {})
        return PlanningContext.from_dict(raw)

    @staticmethod
    def _coerce_validation(validation) -> ScheduleValidationResult | None:
        if validation is None:
            return None
        if isinstance(validation, ScheduleValidationResult):
            return validation
        return ScheduleValidationResult.model_validate(validation)

    @staticmethod
    def _coerce_metrics(metrics) -> ScheduleMetrics | None:
        if metrics is None:
            return None
        if isinstance(metrics, ScheduleMetrics):
            return metrics
        return ScheduleMetrics.model_validate(metrics)

    @staticmethod
    def _split_candidates(candidates) -> tuple[list, list]:
        singles: list[BlockCandidate] = []
        integrated: list[IntegratedBlockCandidate] = []
        for candidate in candidates or []:
            if isinstance(candidate, IntegratedBlockCandidate):
                integrated.append(candidate)
            elif isinstance(candidate, dict) and "window_start" in candidate:
                integrated.append(IntegratedBlockCandidate.model_validate(candidate))
            else:
                singles.append(
                    candidate
                    if isinstance(candidate, BlockCandidate)
                    else BlockCandidate.model_validate(candidate)
                )
        singles.sort(key=lambda c: c.candidate_id)
        integrated.sort(key=lambda c: c.block_id)
        return singles, integrated

    @staticmethod
    def _group_singles(singles: list[BlockCandidate]) -> dict[str, list[BlockCandidate]]:
        grouped: dict[str, list[BlockCandidate]] = {}
        for candidate in singles:
            for task_id in candidate.task_ids:
                grouped.setdefault(task_id, []).append(candidate)
        for task_id in grouped:
            grouped[task_id].sort(key=lambda c: c.candidate_id)
        return grouped

    @staticmethod
    def _no_solution(status: str) -> bool:
        return status in _SOLVER_NO_SOLUTION_STATUSES

    @staticmethod
    def _task_record(subject_type, subject_id, status, codes, summary, details, evidence) -> ExplanationRecord:
        return ExplanationRecord(
            subject_type=subject_type,
            subject_id=subject_id,
            status=status,
            reason_codes=_sorted_unique(codes),
            summary=summary,
            details=details,
            evidence=evidence,
            metadata={},
        )

    @staticmethod
    def _fmt(value) -> str:
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%d %H:%M")
        return str(value)

    @staticmethod
    def _fmt_date(value) -> str:
        if isinstance(value, datetime):
            return value.date().isoformat()
        if isinstance(value, date):
            return value.isoformat()
        return str(value)


__all__ = ["ExplainabilityService"]