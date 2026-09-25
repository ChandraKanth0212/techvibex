"""Deterministic integrated-block detection (Phase 3A).

Implements the :class:`app.services.IntegratedBlockDetector` interface.

Behaviour:

- integration is only considered within a common corridor + section and only
  when the tasks share a genuine common feasible window;
- a task's feasible windows are its actual feasible candidate intervals; the
  common window is the piecewise intersection of those intervals and is NEVER
  unioned into a false continuous window across a gap;
- participating tasks share possession time sequentially (sum of durations);
  no simultaneity is assumed because the schemas carry no parallel flag;
- maximal compatible groups only; cross-department integration is allowed and
  ``department`` is reported where available but never used as a filter;
- every candidate placement is validated through the :class:`ConstraintEngine`
  for the combined block AND for each participating task individually, so a
  task's own constraints are never bypassed by a merged object;
- ``POWER_CONFLICT`` / ``DEPENDENCY_CONFLICT`` remain explicitly unsupported
  because the current schemas carry no power-isolation / dependency fields.

Determinism: identical inputs + configuration produce identical output order,
block ids and placement choices.

Honesty about bounded search: group enumeration is bounded by
``settings.max_integrated_groups`` and placement scans by
``settings.max_placements_per_group``. When a bound is hit, the result reports
``candidate_search_exhausted`` / ``groups_exhaustive`` in metadata instead of
claiming exhaustive compatibility; an INCOMPATIBLE verdict only asserts
incompatibility over the placements actually examined.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.constraints.engine import ConstraintEngine
from app.core.config import Settings, get_settings
from app.core.context import PlanningContext
from app.services import IntegratedBlockDetector as IntegratedBlockDetectorInterface
from contracts import (
    BlockCandidate,
    ConstraintViolation,
    IntegratedBlockCandidate,
    IntegratedCompatibility,
    ViolationSeverity,
)


@dataclass(frozen=True)
class _TaskSnapshot:
    """Immutable per-task record distilled from a task's feasible candidates."""

    task_id: str
    corridor_id: str
    section: str
    duration_minutes: int
    required_resources: tuple[str, ...]
    department: str | None
    work_type: str
    priority: str
    intervals: tuple[tuple[datetime, datetime], ...]
    request_ids: tuple[str, ...]
    source_candidate_id: str


def _parse_base_window(value) -> tuple[datetime, datetime] | None:
    """Parse the ``[start_iso, end_iso]`` pair stored in candidate metadata."""
    try:
        raw_start, raw_end = value[0], value[1]
        start = raw_start if isinstance(raw_start, datetime) else datetime.fromisoformat(str(raw_start))
        end = raw_end if isinstance(raw_end, datetime) else datetime.fromisoformat(str(raw_end))
    except (IndexError, TypeError, ValueError):
        return None
    if end <= start:
        return None
    return start, end


def _merge_intervals(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    """Merge strictly overlapping intervals into disjoint, sorted pieces.

    Only truly overlapping intervals are merged (their coverage is continuous);
    disjoint pieces are ALWAYS kept separate so no false window is invented.
    """
    merged: list[tuple[datetime, datetime]] = []
    for start, end in sorted(intervals, key=lambda p: (p[0], p[1])):
        if merged and start < merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _intersect_pieces(
    a_pieces: list[tuple[datetime, datetime]],
    b_pieces: list[tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    """Piecewise interval intersection: every surviving piece is a genuine overlap."""
    pieces: list[tuple[datetime, datetime]] = []
    for a_start, a_end in a_pieces:
        for b_start, b_end in b_pieces:
            start, end = max(a_start, b_start), min(a_end, b_end)
            if end > start:
                pieces.append((start, end))
    return _merge_intervals(pieces)


def _minutes_fit(pieces: list[tuple[datetime, datetime]], total_minutes: int) -> bool:
    return any((end - start).total_seconds() // 60 >= total_minutes for start, end in pieces)


class IntegratedBlockDetector(IntegratedBlockDetectorInterface):
    """Finds task groups that can share one integrated possession block."""

    def __init__(
        self,
        settings: Settings | None = None,
        constraint_engine: ConstraintEngine | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._engine = constraint_engine or ConstraintEngine(settings=self._settings)

    @property
    def settings(self) -> Settings:
        return self._settings

    @property
    def engine(self) -> ConstraintEngine:
        return self._engine

    # -------------------------------------------------------- public contract

    def detect(
        self,
        candidates: list[BlockCandidate],
        corridors,
        context: dict,
    ) -> list[IntegratedBlockCandidate]:
        """Return integrated block candidates in deterministic order."""
        raw = dict(context or {})
        if corridors and not raw.get("corridors"):
            raw["corridors"] = corridors
        ctx = PlanningContext.from_dict(raw)

        feasible = [c for c in candidates or [] if c.feasible]
        snapshots = self._build_snapshots(feasible, ctx)
        if not snapshots:
            return []

        buckets: dict[tuple[str, str], list[_TaskSnapshot]] = {}
        for snapshot in snapshots:
            key = (snapshot.corridor_id, snapshot.section)
            buckets.setdefault(key, []).append(snapshot)
        for snapshot_list in buckets.values():
            snapshot_list.sort(key=lambda s: s.task_id)

        results: list[IntegratedBlockCandidate] = []
        for key in sorted(buckets):
            groups, groups_exhaustive = self._maximal_groups(buckets[key])
            for group in groups:
                results.append(self._evaluate_group(group, ctx, groups_exhaustive))

        results.sort(key=lambda candidate: candidate.block_id)
        if len(results) > self._settings.max_integrated_groups:
            results = results[: self._settings.max_integrated_groups]
        return results

    # ------------------------------------------------------------- snapshots

    def _build_snapshots(
        self, candidates: list[BlockCandidate], ctx: PlanningContext
    ) -> list[_TaskSnapshot]:
        task_lookup = {task.task_id: task for task in ctx.tasks}
        sources: dict[str, dict] = {}

        for candidate in sorted(candidates, key=lambda c: c.candidate_id):
            for task_id in sorted(candidate.task_ids):
                record = sources.get(task_id)
                if record is None:
                    record = {
                        "source_candidate_id": candidate.candidate_id,
                        "corridor_id": candidate.corridor_id,
                        "section": candidate.section,
                        "duration_minutes": None,
                        "resources": set(),
                        "requests": set(),
                        "intervals": [],
                    }
                    sources[task_id] = record
                elif candidate.candidate_id < record["source_candidate_id"]:
                    record["source_candidate_id"] = candidate.candidate_id
                    record["corridor_id"] = candidate.corridor_id
                    record["section"] = candidate.section

                if candidate.source_request_id:
                    record["requests"].add(candidate.source_request_id)

                base_window = candidate.metadata.get("base_window")
                if base_window:
                    pair = _parse_base_window(base_window)
                    if pair and pair not in record["intervals"]:
                        record["intervals"].append(pair)

                duration = candidate.metadata.get("required_duration_minutes")
                if duration is not None:
                    record["duration_minutes"] = duration

                resources = candidate.metadata.get("required_resources")
                if resources:
                    record["resources"].update(resources)

        snapshots: list[_TaskSnapshot] = []
        for task_id in sorted(sources):
            record = sources[task_id]
            task = task_lookup.get(task_id)

            duration = record["duration_minutes"]
            if duration is None and task is not None:
                duration = task.estimated_duration_minutes
            if duration is None:
                continue

            intervals = _merge_intervals(record["intervals"])
            if not intervals:
                continue

            if task is not None:
                department = task.department or task.metadata.get("department")
                work_type = task.work_type.value
                priority = task.priority.value
            else:
                department = None
                work_type = ""
                priority = ""

            snapshots.append(
                _TaskSnapshot(
                    task_id=task_id,
                    corridor_id=record["corridor_id"],
                    section=record["section"],
                    duration_minutes=int(duration),
                    required_resources=tuple(sorted(record["resources"])),
                    department=department,
                    work_type=work_type,
                    priority=priority,
                    intervals=tuple(intervals),
                    request_ids=tuple(sorted(record["requests"])),
                    source_candidate_id=record["source_candidate_id"],
                )
            )
        return snapshots

    # -------------------------------------------------------- group formation

    def _maximal_groups(
        self, bucket: list[_TaskSnapshot]
    ) -> tuple[list[list[_TaskSnapshot]], bool]:
        """Emit maximal, window-feasible groups only.

        A group is window-feasible when its common feasible window (piecewise
        intersection, gaps preserved) can host the group's sequential duration.
        Feasibility is monotone (adding tasks only shrinks the window and grows
        the duration), so infeasible groups are never extended.
        """
        n = len(bucket)
        if n < 2:
            return [], True
        max_size = min(self._settings.max_integrated_group_size, n)
        ceiling = self._settings.max_integrated_groups

        cache: dict[frozenset, tuple[list[tuple[datetime, datetime]], int]] = {}

        def geometry(idx_set: frozenset) -> tuple[list[tuple[datetime, datetime]], int]:
            cached = cache.get(idx_set)
            if cached is not None:
                return cached
            members = [bucket[i] for i in sorted(idx_set)]
            pieces = list(members[0].intervals)
            total = sum(member.duration_minutes for member in members)
            for member in members[1:]:
                pieces = _intersect_pieces(pieces, list(member.intervals))
                if not pieces:
                    break
            cache[idx_set] = (pieces, total)
            return cache[idx_set]

        levels: dict[int, set[frozenset]] = {1: {frozenset([i]) for i in range(n)}}
        enumerated = 0
        truncated = False

        for size in range(2, max_size + 1):
            current: set[frozenset] = set()
            for prev in sorted(levels[size - 1], key=lambda s: tuple(sorted(s))):
                for index in range(n):
                    if index in prev:
                        continue
                    candidate_set = prev | frozenset([index])
                    if candidate_set in current:
                        continue
                    if enumerated >= ceiling:
                        truncated = True
                        break
                    pieces, total = geometry(candidate_set)
                    if _minutes_fit(pieces, total):
                        current.add(candidate_set)
                    enumerated += 1
                if truncated:
                    break
            levels[size] = current
            if truncated:
                break

        groups: list[list[_TaskSnapshot]] = []
        for size in range(2, max_size + 1):
            supersets = levels.get(size + 1, set())
            for group_set in sorted(levels[size], key=lambda s: (len(s), tuple(sorted(s)))):
                if size < max_size and any(group_set.issubset(t) for t in supersets):
                    continue
                groups.append([bucket[i] for i in sorted(group_set)])

        return groups, not truncated

    # ------------------------------------------------------------ evaluation

    def _evaluate_group(
        self, group: list[_TaskSnapshot], ctx: PlanningContext, groups_exhaustive: bool
    ) -> IntegratedBlockCandidate:
        block_id = self._block_id(group)
        pieces = self._common_pieces(group)
        total_minutes = sum(snapshot.duration_minutes for snapshot in group)

        earliest = min(start for start, _ in pieces)
        latest = max(
            end for start, end in pieces if (end - start).total_seconds() // 60 >= total_minutes
        )

        placements, total_possible, cap_hit = self._enumerate_placements(pieces, total_minutes)

        rejection: dict[str, ConstraintViolation] = {}
        winning: tuple[datetime, datetime] | None = None
        winning_warnings: list[ConstraintViolation] = []
        placements_examined = 0

        for start, end in placements:
            placements_examined += 1
            violations = self._validate_placement(group, ctx, block_id, start, end)
            errors = [v for v in violations if v.severity == ViolationSeverity.ERROR]
            if errors:
                for violation in errors:
                    rejection.setdefault(violation.violation_code, violation)
                continue
            winning = (start, end)
            winning_warnings = [v for v in violations if v.severity != ViolationSeverity.ERROR]
            break

        search_exhausted = (not cap_hit) and placements_examined == total_possible

        metadata = {
            "source_candidate_ids": sorted(set(snapshot.source_candidate_id for snapshot in group)),
            "work_types": sorted({s.work_type for s in group if s.work_type}),
            "priorities": sorted({s.priority for s in group if s.priority}),
            "sequential_duration_minutes": total_minutes,
            "placements_examined": placements_examined,
            "placements_total": total_possible,
            "candidate_search_exhausted": search_exhausted,
            "groups_exhaustive": groups_exhaustive,
        }

        departments = sorted(
            {s.department for s in group if s.department},
            key=lambda value: value.lower(),
        )
        request_ids = sorted(
            {request_id for s in group for request_id in s.request_ids}
        )

        if winning is not None:
            start, end = winning
            return IntegratedBlockCandidate(
                block_id=block_id,
                task_ids=[s.task_id for s in group],
                request_ids=request_ids,
                corridor_id=group[0].corridor_id,
                section=group[0].section,
                window_start=start,
                window_end=end,
                earliest_feasible_start=earliest,
                latest_feasible_end=latest,
                total_required_duration_minutes=total_minutes,
                shared_possession_minutes=total_minutes,
                participating_departments=departments,
                work_types=sorted({s.work_type for s in group if s.work_type}),
                compatibility=IntegratedCompatibility.COMPATIBLE,
                violations=winning_warnings,
                metadata=metadata,
            )

        return IntegratedBlockCandidate(
            block_id=block_id,
            task_ids=[s.task_id for s in group],
            request_ids=request_ids,
            corridor_id=group[0].corridor_id,
            section=group[0].section,
            window_start=None,
            window_end=None,
            earliest_feasible_start=earliest,
            latest_feasible_end=latest,
            total_required_duration_minutes=total_minutes,
            shared_possession_minutes=None,
            participating_departments=departments,
            work_types=sorted({s.work_type for s in group if s.work_type}),
            compatibility=IntegratedCompatibility.INCOMPATIBLE,
            violations=list(rejection.values()),
            metadata=metadata,
        )

    def _common_pieces(
        self, group: list[_TaskSnapshot]
    ) -> list[tuple[datetime, datetime]]:
        pieces = list(group[0].intervals)
        for snapshot in group[1:]:
            pieces = _intersect_pieces(pieces, list(snapshot.intervals))
            if not pieces:
                return []
        return pieces

    def _enumerate_placements(
        self,
        pieces: list[tuple[datetime, datetime]],
        total_minutes: int,
    ) -> tuple[list[tuple[datetime, datetime]], int, bool]:
        step_minutes = self._settings.candidate_step_minutes
        cap = self._settings.max_placements_per_group
        step = timedelta(minutes=step_minutes)

        total_possible = 0
        for start, end in pieces:
            available = (end - start).total_seconds() // 60
            if available < total_minutes:
                continue
            total_possible += int((available - total_minutes) // step_minutes) + 1

        placements: list[tuple[datetime, datetime]] = []
        cap_hit = False
        for start, end in pieces:
            available = (end - start).total_seconds() // 60
            if available < total_minutes:
                continue
            limit = end - timedelta(minutes=total_minutes)
            cursor = start
            while cursor <= limit:
                if len(placements) >= cap:
                    cap_hit = True
                    break
                placements.append((cursor, cursor + timedelta(minutes=total_minutes)))
                cursor += step
            if cap_hit:
                break
        return placements, total_possible, cap_hit

    def _validate_placement(
        self,
        group: list[_TaskSnapshot],
        ctx: PlanningContext,
        block_id: str,
        start: datetime,
        end: datetime,
    ) -> list[ConstraintViolation]:
        """Validate the combined block AND every participating task placement."""
        context = ctx.model_dump()
        violations: list[ConstraintViolation] = []

        total_minutes = int((end - start).total_seconds() // 60)
        group_candidate = BlockCandidate(
            candidate_id=f"{block_id}-group",
            task_ids=[snapshot.task_id for snapshot in group],
            corridor_id=group[0].corridor_id,
            section=group[0].section,
            start_time=start,
            end_time=end,
            total_duration_minutes=total_minutes,
            metadata={"required_duration_minutes": total_minutes},
        )
        violations.extend(self._engine.validate(group_candidate, context))

        offset = timedelta(0)
        for index, snapshot in enumerate(group):
            task_start = start + offset
            task_end = task_start + timedelta(minutes=snapshot.duration_minutes)
            task_candidate = BlockCandidate(
                candidate_id=f"{block_id}-{snapshot.task_id}-t{index:03d}",
                task_ids=[snapshot.task_id],
                corridor_id=snapshot.corridor_id,
                section=snapshot.section,
                start_time=task_start,
                end_time=task_end,
                total_duration_minutes=snapshot.duration_minutes,
                metadata={"required_duration_minutes": snapshot.duration_minutes},
            )
            violations.extend(self._engine.validate(task_candidate, context))
            offset += timedelta(minutes=snapshot.duration_minutes)

        return violations

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _block_id(group: list[_TaskSnapshot]) -> str:
        corridor = group[0].corridor_id
        task_part = "_".join(sorted(snapshot.task_id for snapshot in group))
        return f"IB-{corridor}-{task_part}"


__all__ = ["IntegratedBlockDetector"]