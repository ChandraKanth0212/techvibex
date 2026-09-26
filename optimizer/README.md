# RailOpt Optimization Engine — Module 3

AI-Assisted Railway Integrated Maintenance Block Planner.

**Module 3** takes maintenance tasks plus their AI priority signals and produces
an optimized, verifiable railway maintenance block schedule using Google OR-Tools
CP-SAT.

> **Status:** the OR-Tools CP-SAT `ScheduleOptimizer` (3B) is implemented and
> tested on top of Phase 2 candidate generation/validation and Phase 3A
> integrated-block detection, an **independent** `ScheduleValidator` (Phase 4)
> adjudicates finished schedules, a deterministic `MetricsCalculator` (Phase 5)
> turns the schedule + validation into KPIs, and a deterministic,
> evidence-based `ExplainabilityService` (Phase 6) renders machine-readable
> reason codes + human-readable explanations — without any LLM. Phase 7A
> exposes the whole pipeline over HTTP and Phase 8C freezes that HTTP surface
> into a stable, DTO-typed contract for Module 4.

---

## Purpose

Indian Railways issues separate block requests for track, OHE, signalling and
other maintenance that often cover the same corridor and overlap in time. Module 3
consolidates these into **integrated blocks** that minimise separate possessions,
respect safety buffers and forecast goods traffic, and produce an explainable,
independently validated schedule.

Planned pipeline:

```
Maintenance Tasks
  → AI Priority (Module 2)
  → Candidate Generation              [Phase 2 ✅]
  → Hard Constraint Validation        [Phase 2 ✅]
  → Integrated Block Detection        [Phase 3A ✅]
  → OR-Tools CP-SAT Optimization      [Phase 3B ✅]
  → Independent Schedule Validation   [Phase 4 ✅]
  → Metrics                           [Phase 5 ✅]
  → Explainable Schedule              [Phase 6 ✅]
  → REST API (Module 4 frontend)      [Phase 7A ✅]
  → Stable API DTO contract           [Phase 8C ✅]
```

## Architecture

- **`contracts/`** — *temporary* shared Pydantic schemas (see its README) to be
  moved to the repository-wide `/contracts` once Modules 1/2 publish them.
- **`app/api`** — FastAPI routes, the app factory, the structured error handlers
  and the internal→API DTO mappers.
- **`app/core`** — configuration (`RAILOPT_*` env vars, defaults, objective
  weights) and `PlanningContext` (typed world-state snapshot for the engines).
- **`app/models`** — engine-internal domain models (e.g. `DataMode`).
- **`app/schemas`** — the published transport contract: `api.py` holds the
  stable response DTOs Module 4 codes against, `optimizer.py` the request
  models, `health.py` the liveness payload.
- **`app/services`** — abstract interfaces for the pipeline stages, plus the
  concrete `CandidateGenerator`, `IntegratedBlockDetector`, `ScheduleOptimizer`,
  `ScheduleValidator`, `MetricsCalculator` and `ExplainabilityService`
  implementations.
- **`app/constraints`** — `ConflictCode` vocabulary and the concrete
  `ConstraintEngine` (hard-constraint validation).
- **`app/optimizer` | `app/validators` | `app/explainability` | `app/metrics`
  | `app/utils`** — reserved packages for later phases.
- **`tests/unit`, `tests/integration`, `tests/scenarios`, `tests/performance`** —
  unit, integration, scenario and (future) performance layers.
- **`demo_data/`** — synthetic demo datasets (Phase 3).
- **`scripts/`** — utility / demo runners (Phase 3).

## Directory structure

```
optimizer/
├── app/
│   ├── api/            health + optimizer routers, app factory, structured
│   │                   error handlers, internal→API DTO mappers
│   ├── core/           Settings / ObjectiveWeights / env loading / PlanningContext
│   ├── models/         DataMode and other internal enums
│   ├── schemas/        api.py (stable response DTOs) + optimizer.py (requests)
│   │                   + health.py
│   ├── services/       pipeline ABCs (CandidateGenerator, ConstraintEngine,
│   │                   IntegratedBlockDetector, ScheduleOptimizer,
│   │                   ScheduleValidator, MetricsCalculator)
│   │                   ├── candidate_generator.py   concrete CandidateGenerator (Phase 2)
│   │                   ├── integrated_block_detector.py concrete IntegratedBlockDetector (Phase 3A)
│   │                   ├── schedule_optimizer.py    concrete CP-SAT ScheduleOptimizer (Phase 3B)
│   │                   ├── schedule_validator.py    concrete ScheduleValidator (Phase 4)
│   │                   ├── metrics_calculator.py    concrete MetricsCalculator (Phase 5)
│   │                   ├── explainability.py        concrete ExplainabilityService (Phase 6)
│   │                   └── pipeline.py              PlanBuilder orchestration (Phase 7A)
│   ├── constraints/    ConflictCode + concrete ConstraintEngine (Phase 2)
│   ├── optimizer/      reserved (Phase 3)
│   ├── validators/     reserved (Phase 3)
│   ├── explainability/ reserved (Phase 3)
│   ├── metrics/        reserved placeholder (Phase 5 moved computation to app/services)
│   └── utils/          reserved (Phase 3)
├── contracts/          TEMPORARY shared schemas (see contracts/README.md)
├── tests/
│   ├── unit/           contracts, config, services, engine, generator
│   ├── integration/    FastAPI /health + pipeline routes + Module 4 API contract
│   ├── scenarios/      Phase 2/3A/3B/4/5/6 end-to-end scenarios
│   └── performance/    reserved (Phase 3)
├── demo_data/          reserved (Phase 3)
├── scripts/            reserved (Phase 3)
├── requirements.txt
├── Dockerfile
└── README.md
```

## Phases implemented

### Phase 2 — candidate generation & hard constraints

**`CandidateGenerator`** (`app/services/candidate_generator.py`)

- derives a per-task availability window from the task window, a matching
  `BlockRequest` in the context, or the planning horizon;
- resolves the block section from the matching request, the task's asset
  (in context), or `task.metadata["section"]`;
- enumerates deterministic start times at `candidate_step_minutes` so the whole
  task duration fits (multiple candidates per task/request);
- when the window is too short for the full duration, keeps a single clamped
  candidate so the shortfall is never lost;
- validates every candidate through the `ConstraintEngine` and preserves
  rejection information **on the candidate** (`rejected`, `violations`,
  `rejection_codes`) — nothing is silently dropped;
- deterministic: same inputs + configuration ⇒ same order and content.

**`ConstraintEngine`** (`app/constraints/engine.py`)

Machine-readable conflict codes (`app/constraints/codes.py`). Conflicts are only
reported when the supplied data actually supports them (empty/absent data
disables a check rather than fabricating a result). `evaluate()` returns a
structured `ValidationResult` (`valid` + `violations`).

| Code | Status | Data used |
| --- | --- | --- |
| `DURATION_CONFLICT` | ✅ | task duration vs candidate window |
| `TIME_CONFLICT` (horizon) | ✅ | candidate vs context horizon `[start, end]` |
| `CORRIDOR_CONFLICT` | ✅ | corridor against the provided corridor set |
| `LOCATION_CONFLICT` | ✅ | section against the corridor's `sections` |
| `EXISTING_BLOCK_CONFLICT` | ✅ | candidates vs PLANNED/APPROVED/ACTIVE blocks |
| `TRAIN_CONFLICT` | ✅ | protected movements + configured safety buffer |
| `RESOURCE_CONFLICT` | ✅ | required resources vs availability windows |
| `GOODS_CONFLICT` | ✅/⚠ | goods forecast probability vs configured thresholds |
| `POWER_CONFLICT` | ⛔ unsupported | schemas carry no power-isolation fields |
| `DEPENDENCY_CONFLICT` | ⛔ unsupported | tasks carry no prerequisite/dependency fields |

Goods forecast behaviour: overlap + `probability >= goods_forecast_peak_threshold`
is blocking (`ERROR`); overlap between the minimum and peak thresholds is
advisory (`WARNING`); below the minimum threshold no conflict.

Constraints intentionally left unsupported because the current contract schemas
lack the required data are documented in
`app.constraints.codes.UNSUPPORTED_CONFLICT_CODES` — no fields were invented.

### Phase 3A — integrated block detection

**`IntegratedBlockDetector`** (`app/services/integrated_block_detector.py`)

- detects opportunities to merge independent requests into **one possession
  block** within a common corridor + section;
- uses each task's **actual feasible candidate intervals** (from candidate
  metadata) and intersects them **piecewise** — disconnected feasible windows
  are preserved and never unioned into a false continuous window;
- participating tasks share possession time **sequentially** (sum of
  durations); no simultaneity is assumed (the schemas carry no parallel flag);
- emits **maximal compatible groups only** (bounded by
  `max_integrated_group_size`); cross-department integration is allowed and
  `department` (contract field or `task.metadata["department"]`) is reported
  where available but **never used as an exclusion rule**;
- every candidate placement is validated through the `ConstraintEngine` for
  the **combined block AND each participating task individually**, so a
  task's own constraints are never bypassed by a merged object;
- honest bounded search: `candidate_search_exhausted` / `groups_exhaustive`
  metadata report whether the placement scan / group enumeration covered the
  whole space, so an `INCOMPATIBLE` verdict never over-claims exhaustiveness
  when a configured cap truncated the search;
- deterministic: stable group ids (`IB-{corridor}-{task_ids}`), sorted output,
  stable placement choices.

Output is `IntegratedBlockCandidate` (with `compatibility`,
`rejection_codes`, participating departments and metadata); a
`to_integrated_block()` bridge converts it to the Phase 1 `IntegratedBlock`
for the future CP-SAT stage.

### Phase 3B — CP-SAT schedule optimization

**`ScheduleOptimizer`** (`app/services/schedule_optimizer.py`) solves the
selection problem with Google OR-Tools CP-SAT. It consumes the Phase 2 /
Phase 3A outputs (feasible single-task candidates + compatible integrated-block
candidates) and decides **which** candidates to schedule.

Model design:

- **Boolean selection variables only** — `x[candidate] ∈ {0,1}`; there are no
  per-minute variables. Time is an integer count of minutes from a fixed origin
  (`context.horizon_start`, or the earliest candidate start when the context
  carries no horizon), so candidate placements are fixed and the model stays
  small.
- Hard constraints (never relaxed):
  1. at most one candidate selected **per task** (an integrated block covers
     all of its member tasks, so selecting it blocks competing singles and
     integrated-block consistency is structural);
  2. tasks with `PriorityLevel.URGENT` that have at least one model candidate
     are **mandatory** (exactly one selected) — if two mandatory placements
     conflict the model is `INFEASIBLE`, never a silent drop;
  3. pairwise mutual exclusion for any two overlapping candidates that share a
     corridor + section **or** a resource with `capacity == 1` (capacity > 1
     resource contention is documented as future work);
  4. upstream `ConstraintEngine` hard constraints (train buffer, existing
     blocks, peak goods windows, location/horizon) are inputs, not re-derived.
- Objective (maximised, integer-scaled with `_SCALE = 100000`, all terms
  weighted by `ObjectiveWeights`):
  - `task_completion` per task covered by a selected candidate;
  - `priority_adherence` from the Module 2 `AIRecommendation.priority_score`
    (0..100 normalised to 0..1) or a deterministic `PriorityLevel` fallback when
    no AI rec exists (`metadata.priority_source` reports which was used);
  - `overdue_reduction` scaled by how overdue the work is against the horizon
    anchor (`context.horizon_start.date()`, never `date.today()`);
  - `slot_consolidation × (tasks − 1)` for integrated blocks;
  - `resource_efficiency × utilization` (currently constant `1.0` because
    feasible placements are tight possessions — documented);
  - `− forecast_alignment ×` a soft goods-train penalty that reuses the
    configured thresholds (peak windows are already hard-ERROR, so only the
    elevated band contributes).
- Determinism: variables, constraints and objective terms are added in sorted
  order, and CP-SAT runs with `num_search_workers=1` + `random_seed=0`, so
  identical input + configuration produces an identical solution.
- Status honesty: `OPTIMAL → OPTIMAL`, `FEASIBLE → FEASIBLE`,
  `INFEASIBLE → INFEASIBLE`, `MODEL_INVALID → ERROR`, else `UNKNOWN` — a
  `FEASIBLE` result is never labelled `OPTIMAL`. When the model has no
  solution, no fake schedule is produced and every scoped task is reported
  unscheduled with a reason.

Scope and error handling: only tasks referenced by `request.task_ids` are
optimised; ids absent from the context are a loud `ERROR` (input malformed),
never a silent skip. An empty context, a generation failure, or a model with no
feasible candidates each return structured `ERROR` / `UNKNOWN` results instead of
crashing. The result is `ScheduleResult` (`selected_blocks`,
`scheduled_task_ids`, `unscheduled_tasks` with per-task counts/reasons, solver
metadata); `ScheduleResult.to_optimization_result()` bridges to the Phase 1
`OptimizationResult` contract for backwards compatibility.

> **Host quirk:** `ortools.sat.python.cp_model` imports pandas unconditionally,
> and on this Windows host pandas' compiled DLLs are blocked by an Application
> Control policy. Real numpy imports fine; cp_model only uses pandas for
> optional DataFrame helpers this engine never calls, so the module injects a
> minimal pandas stub into `sys.modules` only when the real pandas cannot be
> imported.

### Phase 4 — independent schedule validation

**`ScheduleValidator`** (`app/services/schedule_validator.py`) adjudicates a
finished `ScheduleResult` against the `PlanningContext` **without trusting the
solver**. Guiding principle: *independent verification*.

- never calls `ScheduleOptimizer.optimize()` and never rebuilds the CP-SAT
  model — it operates solely on the finished schedule plus the domain context;
- **`OPTIMAL`/`FEASIBLE` never imply `valid`** — status is treated as metadata.
  An `OPTIMAL` schedule with a corrupted/tampered block is rejected; a
  `FEASIBLE` schedule that satisfies every independent check is `valid`;
- every selected block is re-read from scratch and the existing
  `ConstraintEngine` is reused through reconstructed `BlockCandidate`
  placements (`VAL:{block_id}:GROUP`, and `VAL:{block_id}:{task_id}` for each
  integrated participant) — the domain rules the engine owns (planning horizon,
  corridor/section availability, existing blocks, protected train movements with
  the configured safety buffer, resource availability, goods-forecast windows)
  are re-verified, not taken on the solver's word;
- deterministic: blocks and tasks are visited in sorted order and all
  violations are canonically ordered.

Independent schedule-level checks on top of the engine:

| Responsibility | Location |
| --- | --- |
| Block time validity (start < end, declared vs actual span, horizon) | `_validate_block` |
| Task validity (existence, single assignment, coverage both ways) | `_validate` |
| Candidate/placement feasibility (engine-verified) | `_validate_block` |
| Corridor conflicts (overlapping blocks, same corridor + section) | `_validate` pairwise |
| Train conflicts (protected movements + safety buffer, engine) | reused `ConstraintEngine` |
| Existing-block conflicts (engine) | reused `ConstraintEngine` |
| Resource conflicts (capacity-1 double-booking + availability, engine) | pairwise + engine |
| Location compatibility (task/block corridor + section) | `_validate_block` |
| Integrated-block validity (compatibility, sequential duration, no omission) | `_validate_block` |
| Scheduled/unscheduled consistency + record coherence | `_validate` |
| Solver-status honesty (no fake schedule on INFEASIBLE/ERROR/UNKNOWN) | `_validate` |

Result: `ScheduleValidationResult` (`schedule_id`, `solver_status`, `valid`,
`errors`, `warnings`, block/task counts, `metadata`), with
`to_validation_report()` bridging to the Phase 1 `ValidationReport` contract.

**Conflict-code policy.** Domain conflicts reuse the existing `ConflictCode`
vocabulary verbatim. Schedule-structure issues the domain vocabulary does not
name use a small documented set of report codes:

| Code | Severity | Meaning |
| --- | --- | --- |
| `UNKNOWN_TASK` | ERROR | scheduled/blocked task id absent from context |
| `DUPLICATE_TASK` | ERROR | task assigned to more than one block / id list |
| `TASK_NOT_COVERED` | ERROR | scheduled ids without a block, or blocked but unscheduled |
| `SCHEDULE_INCONSISTENT` | ERROR | cross-list contradictions (incl. non-solution status + populated schedule) |
| `NO_SOLUTION` | WARNING | solver reported INFEASIBLE/ERROR/UNKNOWN; empty schedule is valid |

`POWER_CONFLICT` and `DEPENDENCY_CONFLICT` remain explicitly **unsupported** —
the schemas carry no power-isolation or dependency fields
(`app.constraints.codes.UNSUPPORTED_CONFLICT_CODES`) — the validator never
invents them. An empty report is the validator's honest answer when optional
context data is absent (no fabricated conflicts).

### Phase 5 — schedule KPI computation

**`MetricsCalculator`** (`app/services/metrics_calculator.py`) turns a finished
`ScheduleResult` (plus the planning context and, optionally, the Phase 4
`ScheduleValidationResult`) into a deterministic `ScheduleMetrics` record.

| Metric | Definition |
| --- | --- |
| `total_tasks_requested` | \|scheduled ∪ unscheduled\| (tasks the result accounts for) |
| `total_tasks_scheduled` / `task_coverage_ratio` | scheduled count / coverage ratio |
| `integrated_blocks_count` | selected blocks of type `INTEGRATED` |
| `block_consolidation_ratio` | scheduled tasks per possession block (≈1.0 for singles, >1.0 when integration merges work) |
| `average_possession_minutes` | mean selected-block span |
| `slot_utilisation_percent` | total possession minutes ÷ planning-horizon minutes (falls back to the blocks' union span when the context has no horizon) |
| `resource_utilisation_percent` | scheduled task-minutes ÷ possession minutes (tasks missing from the context contribute 0, honestly lowering the figure) |
| `scheduled_urgent_tasks` / `unscheduled_urgent_tasks` | URGENT-priority counts from the context task set |
| `conflicts_resolved` | Σ rejection codes on unscheduled task records — the hard conflicts the schedule explicitly *honoured* |
| `validation_accuracy_percent` | 100.0 with no validation errors; else `100 × (1 − min(1, errors / max(1, checked tasks, checked blocks)))` — each validation error withdraws a proportional share |

Honesty doctrine: metrics describe the schedule *as reported*; the one figure
that can contradict the solver (`validation_accuracy_percent`) is **never
fabricated** — it stays `None` when no independent `ScheduleValidationResult`
was supplied. Warnings never lower accuracy (they are advisory). The richer
breakdown (`possession_minutes_total`, `horizon_minutes`,
`scheduled_task_minutes`, `rejection_code_counts`, validation summary) lives in
`extra`, so Phase 1 consumers reading only the original fields keep working.

### Phase 6 — explainable schedule

**`ExplainabilityService`** (`app/services/explainability.py`) attaches
human-readable and machine-readable reasoning to a `ScheduleResult`. It takes
the optional Phase 4 `ScheduleValidationResult`, Phase 5 `ScheduleMetrics` and
candidate detail, and emits a sorted, fully deterministic set of
`ExplanationRecord` objects wrapped in `ExplainabilityResult`:

| Record type | subject_id | Emitted when |
| --- | --- | --- |
| `SCHEDULE` | schedule id | always — solver status, validity status, summary of the run |
| `SCHEDULED_TASK` | task id | the task is in `scheduled_task_ids` |
| `UNSCHEDULED_TASK` | task id | the task has a `TaskSchedulingInfo` and is not scheduled |
| `INTEGRATED_BLOCK` | block id | a selected block has `block_type == INTEGRATED` |
| `VALIDATION_ERROR` / `VALIDATION_WARNING` | violation block (or schedule) id | independent validation reports errors / warnings |
| `METRIC` | schedule id | `metrics` argument provided |

Each record carries `reason_codes` (machine-readable), a one-line `summary`, a
`details` list, `evidence` (the structured facts behind every claim) and the
source `solver_status`.

**Reason-code vocabulary** — existing codes are reused first, new codes only for
real concepts:

- Reused engine codes: the 8 `SUPPORTED_CONFLICT_CODES` (`TRAIN_CONFLICT`,
  `RESOURCE_CONFLICT`, `CORRIDOR_CONFLICT`, `DURATION_CONFLICT`,
  `GOODS_CONFLICT`, `EXISTING_BLOCK_CONFLICT`, `DEPENDENCY_CONFLICT`,
  `POWER_CONFLICT`).
- Reused Phase 4 validator codes: `UNKNOWN_TASK`, `DUPLICATE_TASK`,
  `TASK_NOT_COVERED`, `SCHEDULE_INCONSISTENT`, `NO_SOLUTION`.
- Explainability codes: `SCHEDULED`, `UNSCHEDULED`, `NO_FEASIBLE_CANDIDATE`,
  `SEARCH_TRUNCATED`, `HIGH_PRIORITY`, `URGENT_PRIORITY`, `OVERDUE`,
  `INTEGRATED_BLOCK`, `RESOURCE_AVAILABLE`, `FEASIBLE_WINDOW`,
  `VALIDATION_WARNING`, `VALIDATION_ERROR`. (`CRITICAL_PRIORITY` is deliberately
  absent because `PriorityLevel` has no CRITICAL level.)

`POWER_CONFLICT` and `DEPENDENCY_CONFLICT` remain unenforced by the engine and
are **never** emitted by an explanation; vague codes (`AI_DECISION`,
`SMART_CHOICE`, `OPTIMAL_CHOICE`) are never emitted either.

**Honesty doctrine** — an explanation only restates what the structured inputs
evidence:

- `schedule_valid` comes exclusively from an independent `ScheduleValidationResult`;
  without it it stays `None` and the SCHEDULE record says validity is not claimed.
- Only an `OPTIMAL` result is described as optimal; `FEASIBLE` is "feasible,
  optimality not proven"; `INFEASIBLE`/`ERROR`/`UNKNOWN` never produce a
  schedule that claims validity.
- `NO_FEASIBLE_CANDIDATE` is scoped to the examined candidate set — never a
  global impossibility claim — and `SEARCH_TRUNCATED` is emitted when Candidate
  Generation reached the configured `max_candidates_per_task` cap, so the reader
  knows the examined set may be incomplete.
- Priority evidence prefers the real `AIRecommendation` (Module 2) when present
  (`source: ai_priority_model`, with score/confidence/model_version), else the
  `MaintenanceTask` record. Overdue is judged only when a due date and the
  planning-horizon anchor exist. Resource availability is verified against the
  context resource catalogue; an empty catalogue is "unavailable", never "OK".
- Determinism: identical inputs + configuration yield identical records in
  identical order. Run-wall-clock solver metadata (e.g. `solve_time_seconds`) is
  stripped before copying into an explanation so it cannot break repeatability.

No LLM is involved anywhere — an explanation restates structured facts with code
+ evidence; it never asks AI models to "explain themselves".

### Phase 7A — REST API pipeline integration

The FastAPI app in `app/api/` now exposes the full Phase 2→6 pipeline over HTTP.
`app/services/pipeline.py::PlanBuilder` orchestrates the existing services —
`PlanningContext → CandidateGenerator → ConstraintEngine → IntegratedBlockDetector
→ ScheduleOptimizer → ScheduleValidator → MetricsCalculator → ExplainabilityService`
— and the routes in `app/api/optimizer.py` are thin adapters around it. **No
business logic is duplicated in the routes.**

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | liveness + `dataMode` |
| `POST /api/optimizer/candidates` | generate `BlockCandidate`s for a context (optionally scoped to `task_ids`), with feasibility/rejection detail |
| `POST /api/optimizer/integrated-blocks/discover` | detect integrated-block opportunities among feasible candidates |
| `POST /api/optimizer/generate` | full pipeline: candidates → integrated blocks → CP-SAT schedule → validation → metrics → explanations; stores the plan |
| `POST /api/optimizer/validate` | independent validation only — never invokes the optimizer |
| `GET /api/optimizer/plans/{plan_id}` | retrieve a stored plan |
| `GET /api/optimizer/plans/{plan_id}/conflicts` | conflict / rejection summary for a plan |
| `GET /api/optimizer/plans/{plan_id}/metrics` | KPI snapshot for a plan |

**Request bodies** re-use the shared contracts (JSON-serialisable):

```json
{
  "request": { "request_id": "REQ-1", "task_ids": ["T1", "T2"], "corridor_id": "COR-1", "section": "S1", "requested_start": "2026-01-10T06:00:00Z", "requested_end": "2026-01-10T09:00:00Z" },
  "context": {
    "horizon_start": "2026-01-10T00:00:00Z",
    "horizon_end": "2026-01-17T00:00:00Z",
    "tasks": [ { "task_id": "T1", "asset_id": "AST-001", "corridor_id": "COR-1", "work_type": "PREVENTIVE", "estimated_duration_minutes": 60, "priority": "HIGH", "window_start": "2026-01-10T06:00:00Z", "window_end": "2026-01-10T09:00:00Z" } ],
    "corridors": [ { "corridor_id": "COR-1", "name": "Main line", "origin_station": "A", "destination_station": "B", "sections": ["S1"] } ]
  },
  "settings": { "max_candidates_per_task": 20, "objective_weights": { "slot_consolidation": 1.5 } }
}
```

- `request` is optional on `/generate` when exactly one `context.block_requests`
  entry exists (it is then resolved from the context); otherwise a 400
  `REQUEST_REQUIRED` is returned.
- `settings` is optional; every field overrides the matching `Settings` /
  `ObjectiveWeights` value, unset fields inherit the app configuration.
- `schedule.solver_metadata` and `explanation` records exclude
  run-wall-clock values (`solve_time_seconds` etc.) so identical inputs +
  configuration produce **byte-identical** responses.

**`POST /api/optimizer/generate` response** — `PlanResponse`:

```json
{
  "plan_id": "PLAN-3DA9A4233AF95580", "data_mode": "SYNTHETIC_DEMO", "storage": "IN_MEMORY",
  "request_id": "REQ-1", "solver_status": "OPTIMAL",
  "schedule": {
    "schedule_id": "SCHED-REQ-1", "status": "OPTIMAL", "message": "", "objective_value": 0.0,
    "scheduled_task_ids": ["T1"], "unscheduled_task_ids": [], "unscheduled_tasks": [],
    "selected_blocks": [
      {
        "block_id": "BLK-1", "task_ids": ["T1"], "request_ids": ["REQ-1"],
        "corridor_id": "COR-1", "section": "S1",
        "start_time": "2026-01-10T06:00:00Z", "end_time": "2026-01-10T07:00:00Z",
        "duration_minutes": 60, "integrated": false, "block_type": "SINGLE",
        "participating_departments": ["Signalling"], "resources": [],
        "status": "SCHEDULED"
      }
    ],
    "solver_metadata": {}
  },
  "validation": { "schedule_id": "SCHED-REQ-1", "solver_status": "OPTIMAL", "valid": true, "errors": [], "warnings": [], "checked_block_count": 1, "checked_task_count": 1, "metadata": {} },
  "metrics": { "total_tasks_requested": 1, "total_tasks_scheduled": 1, "task_coverage_ratio": 1.0, "integrated_blocks_count": 0, "validation_accuracy_percent": 100.0, "extra": {} },
  "explanations": { "schedule_id": "SCHED-REQ-1", "solver_status": "OPTIMAL", "schedule_valid": true, "validation_provided": true, "records": [], "metadata": {} },
  "candidates": [], "integrated_candidates": [],
  "meta": { "scope_task_ids": ["T1"] }
}
```

Solver status is preserved verbatim (never relabelled); the independent
`validation.valid` is decided only by the schedule content, and every explanation
record keeps its `reason_codes` and `evidence`. See
[Phase 8C](#phase-8c--stable-module-4-api-dto-contract) for the DTO contract
these shapes are guaranteed by.

**Error behaviour** — all errors use one envelope:

```json
{ "error": { "code": "...", "message": "...", "details": {}, "request_id": "REQ-1" } }
```

| HTTP | Code | Trigger |
| --- | --- | --- |
| `400` | `EMPTY_CONTEXT` | context has no tasks / invalid request |
| `400` | `EMPTY_SCOPE` | scoped task subset has no tasks |
| `400` | `UNKNOWN_TASK_REFERENCED` | `task_ids` / request references a task absent from the context |
| `400` | `REQUEST_REQUIRED` | `/generate` without a request and no context block requests |
| `400` | `CANDIDATE_GENERATION_FAILED` / `INTEGRATED_BLOCK_DETECTION_FAILED` | generation/detection raised |
| `404` | `NOT_FOUND` | unknown `plan_id` |
| `409` | `PLAN_METRICS_UNAVAILABLE` / `PLAN_VALIDATION_UNAVAILABLE` | requested view absent from the stored plan |
| `422` | `REQUEST_VALIDATION` | malformed / out-of-range request body |
| `500` | `INTERNAL_ERROR` | unexpected failure (no tracebacks leaked) |

`error.request_id` is resolved from, in order: the `x-request-id` request header,
the body's `request.request_id` (or a top-level `request_id`), else `null` — so
every failure is correlatable without parsing the message.

**Determinism & storage** — plan ids are content-addressed
(`PLAN-<sha256(request+context+settings)>`); idempotent identical requests return
the same plan and identical bodies. Plans live in an **in-memory demo store**
(`storage: "IN_MEMORY"`): they are not persisted across restarts and never
claimed to be a real database. The engine still runs on **synthetic demo data**
(`dataMode: "SYNTHETIC_DEMO"`); nothing claims live IR integration.

**Quick start** (see "Running the API"):

```bash
# bash / curl
curl -s http://127.0.0.1:8000/health
curl -s -X POST http://127.0.0.1:8000/api/optimizer/generate -H "Content-Type: application/json" -d @body.json
```

```powershell
# PowerShell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/optimizer/generate -ContentType "application/json" -InFile body.json
```

### Phase 8C — stable Module 4 API DTO contract

Phase 7A's endpoints returned the *internal* contract models
(`ScheduleResult`, `BlockCandidate`, `ScheduleMetrics`, …) verbatim. That
coupled Module 4 to engine internals: renaming a field in `contracts/` silently
broke the frontend, and every solver/metadata field leaked across the wire.

Phase 8C puts a dedicated transport layer between the pipeline and HTTP:

```
pipeline outcome  →  app/api/dto_mappers.py  →  app/schemas/api.py  →  JSON
                    (normalise + sanitise)     (the published DTOs)
```

- **`app/schemas/api.py`** — the stable DTOs Module 4 codes against:
  `PlanResponse`, `ScheduleDTO`, `SelectedBlockDTO`, `UnscheduledTaskDTO`,
  `ValidationDTO`, `MetricsDTO`, `ExplanationDTO` / `ExplanationRecordDTO`,
  `CandidateDTO`, `IntegratedBlockDTO`, `CandidatesResponse`,
  `IntegratedBlocksResponse`, `ValidationResponse`, `PlanMetricsResponse`,
  `PlanConflictsResponse` and the `ErrorResponse` / `ErrorDetailDTO` envelope.
  Each is also exported as an `Api*` alias (`ApiPlanResponse`, `ApiSchedule`, …)
  so the transport layer can be imported without colliding with the engine's own
  names. Unknown fields are ignored on input, so **old Module 4 clients keep
  working** when the engine grows a field.
- **`app/api/dto_mappers.py`** — the only place internal results become DTOs.
  It never exposes an engine object: values are coerced to primitives, metadata
  dicts are key-sorted and stripped of non-serialisable entries, and collections
  (`selected_blocks`, `scheduled_task_ids`, `reason_codes`, …) are sorted so
  repeated calls emit byte-identical JSON.
- **`to_internal_schedule()`** is the reverse hop for `POST /validate`: a
  `ScheduleDTO` submitted by Module 4 is rebuilt into a `ScheduleResult`, so the
  validator still verifies a real engine object rather than a DTO.
- **Derived, not invented, fields.** A selected block's `request_ids`,
  `participating_departments` and `resources` are resolved from the planning
  context for its tasks; `duration_minutes` is derived from the block span when
  not declared; `integrated`/`block_type` agree. Nothing is fabricated when the
  context has no such data — the field is simply empty.
- **Determinism.** Run-wall-clock solver metadata (`solve_time_seconds`,
  `runtime_seconds`, `timed_out`, `generated_at`, …) is removed before a plan is
  stored or returned, so identical input + configuration produce byte-identical
  responses. `tests/integration/test_module4_api_contract.py` asserts this by
  generating the same plan twice and comparing the full body.
- **Honest OpenAPI.** Every route declares its own `response_model` *and* its
  error statuses against the `ErrorResponse` model, so `/openapi.json` describes
  the envelope the API really returns instead of FastAPI's default
  `HTTPValidationError`. The runtime error body is *produced from* that DTO, so
  contract and wire format cannot drift.
- **Backwards compatibility.** `app/schemas/optimizer.py` still re-exports every
  response name, so existing imports (`from app.schemas import PlanResponse`)
  keep resolving — now to the stable DTO.

**Contract test** — `tests/integration/test_module4_api_contract.py` pins the
public surface: the exact top-level / schedule / block key sets, the candidate
and integrated-block key sets, the validation and error key sets, DTO
round-tripping, error-envelope equality, runtime-metadata exclusion, the
determinism check, and the OpenAPI assertions (DTO models present, internal
contract models absent, `ErrorResponse` documented on all five error statuses).

## Configuration

All values live in `app/core/config.py`; nothing is hard-coded in the services.

| Setting | Env var | Default |
| --- | --- | --- |
| Safety buffer (minutes) | `RAILOPT_SAFETY_BUFFER_MINUTES` | `15` |
| Goods forecast min probability | `RAILOPT_GOODS_FORECAST_PROBABILITY_THRESHOLD` | `0.60` |
| Goods forecast peak threshold | `RAILOPT_GOODS_FORECAST_PEAK_THRESHOLD` | `0.85` |
| Solver timeout (seconds) | `RAILOPT_SOLVER_TIMEOUT_SECONDS` | `30` |
| Planning horizon (days) | `RAILOPT_PLANNING_HORIZON_DAYS` | `7` |
| Candidate step (minutes) | `RAILOPT_CANDIDATE_STEP_MINUTES` | `30` |
| Max candidates per task | `RAILOPT_MAX_CANDIDATES_PER_TASK` | `50` |
| Max integrated group size | `RAILOPT_MAX_INTEGRATED_GROUP_SIZE` | `5` |
| Max integrated groups | `RAILOPT_MAX_INTEGRATED_GROUPS` | `200` |
| Max placements per group | `RAILOPT_MAX_PLACEMENTS_PER_GROUP` | `1000` |
| Objective weights (6 terms) | — | `slot_consolidation`, `priority_adherence`, `forecast_alignment`, `resource_efficiency`, `task_completion`, `overdue_reduction` — all `1.0` |
| Demo mode | `RAILOPT_DEMO_MODE` | `true` |

## Installation

Python 3.13+ recommended. In a virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

## Running the API

```bash
uvicorn app.api.main:app --reload --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok","module":"optimization-engine","dataMode":"SYNTHETIC_DEMO"}
```

`dataMode` is `SYNTHETIC_DEMO` by default. Set `RAILOPT_DEMO_MODE=false` for
`PRODUCTION`.

The pipeline endpoints live under `/api/optimizer` (full list in the
[Phase 7A section](#phase-7a--rest-api-pipeline-integration)); the exact request
and response contract is in
[Phase 8C](#phase-8c--stable-module-4-api-dto-contract) and browsable at
`/docs` (Swagger UI) or `/openapi.json`. Served data is synthetic; plans are
stored only in memory for the lifetime of the process.

### Docker

```bash
docker build -t railopt-optimizer -f Dockerfile .
docker run -p 8000:8000 railopt-optimizer
```

## Running tests

From the `optimizer/` directory:

```bash
pytest
```

Run just one layer:

```bash
pytest tests/unit
pytest tests/integration
pytest tests/scenarios
```

## Relationship with other modules

- **Module 1 (Data / shared contracts):** once Module 1 publishes `/contracts`,
  the temporary `optimizer/contracts/` package is replaced by imports from there.
  No optimisation code changes otherwise.
- **Module 2 (AI Priority):** consumes the `MaintenanceTask` contract and emits
  `AIRecommendation` (`PriorityResult`). Module 3 currently carries it in the
  `PlanningContext` (`priorities`) for later objective weighting.
- **Module 4 (Frontend / API):** consumes Module 3 outputs (schedule, metrics,
  explainability) through the `/api/optimizer` endpoints plus `/health`. The
  wire contract is the stable DTO layer in `app/schemas/api.py` (Phase 8C), not
  the internal `contracts/` models, so a contract change inside Module 3 does not
  break the frontend.

## Intentionally deferred

Not implemented yet (interfaces prepared in `app/services/`):

- `/replan` (dynamic replanning when the world changes mid-plan)
- Weekly/monthly optimization and horizon roll-over
- Persistence: the in-memory (`IN_MEMORY`) demo plan store is replaced by a real
  database once Module 1 lands
- Authentication / authorization on the API
- Scenario/performance breadth and demo dataset
- Frontend rendering (Module 4)

Phases 2, 3A, 3B, 4, 5, 6, 7A and 8C (candidate generation, hard-constraint
validation, integrated-block detection, CP-SAT optimization, independent schedule
validation, KPI computation, explainable schedules, the REST API surface and its
stable DTO contract) are complete; replanning, persistence and auth follow with
Modules 1, 2 and 4.