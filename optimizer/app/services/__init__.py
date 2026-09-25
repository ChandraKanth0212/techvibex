"""Service layer interfaces for the optimization pipeline.

Phase 1 defines the interfaces only. Concrete algorithms are intentionally not
implemented yet; later phases fill in each method.
"""

from abc import ABC, abstractmethod

from contracts import (
    BlockCandidate,
    BlockRequest,
    Corridor,
    ExplainabilityResult,
    IntegratedBlockCandidate,
    MaintenanceTask,
    OptimizationResult,
    ScheduleMetrics,
    ScheduleResult,
    ScheduleValidationResult,
    ConstraintViolation,
)


class CandidateGenerator(ABC):
    """Generates candidate maintenance blocks from tasks."""

    @abstractmethod
    def generate_candidates(
        self,
        tasks: list[MaintenanceTask],
        corridors: list[Corridor],
        context: dict,
    ) -> list[BlockCandidate]:
        """Translate maintenance tasks into feasible block candidates."""


class ConstraintEngine(ABC):
    """Validates candidates against hard/soft railway constraints."""

    @abstractmethod
    def validate(self, candidate: BlockCandidate, context: dict) -> list[ConstraintViolation]:
        """Return constraint violations for a candidate block."""


class IntegratedBlockDetector(ABC):
    """Detects opportunities to merge independent requests into one block."""

    @abstractmethod
    def detect(
        self,
        candidates: list[BlockCandidate],
        corridors: list[Corridor],
        context: dict,
    ) -> list[IntegratedBlockCandidate]:
        """Find block candidates that can share possession time."""


class ScheduleOptimizer(ABC):
    """Solves the block scheduling problem with OR-Tools CP-SAT."""

    @abstractmethod
    def optimize(self, request: BlockRequest, context: dict) -> ScheduleResult:
        """Produce an optimized schedule for the given request.

        The concrete implementation also offers the legacy
        ``OptimizationResult`` projection via ``ScheduleResult.to_optimization_result()``
        for backward compatibility with the Phase 1 contract.
        """


class ScheduleValidator(ABC):
    """Independently validates a produced schedule."""

    @abstractmethod
    def validate(self, solution: ScheduleResult, context: dict) -> ScheduleValidationResult:
        """Re-check a schedule without trusting the optimizer internals.

        Phase 4: the concrete validator consumes a :class:`ScheduleResult`
        (the actual ScheduleOptimizer output) plus a planning context dict and
        returns a :class:`ScheduleValidationResult`. A
        ``ScheduleValidationResult.to_validation_report()`` bridge preserves the
        Phase 1 ``ValidationReport`` contract for older consumers.
        """


class MetricsCalculator(ABC):
    """Computes KPIs for a schedule."""

    @abstractmethod
    def compute(
        self,
        result: ScheduleResult,
        context: dict,
        validation: ScheduleValidationResult | None = None,
    ) -> ScheduleMetrics:
        """Summarise schedule quality, coverage and constraints handling.

        Phase 5: the concrete calculator consumes a :class:`ScheduleResult`
        (the actual ScheduleOptimizer output) plus a planning context dict and
        returns a :class:`ScheduleMetrics`. When the independent
        :class:`ScheduleValidationResult` is supplied, an accuracy score that
        penalises validation errors is included; without it accuracy stays
        ``None`` (never fabricated).
        """


class ExplainabilityService(ABC):
    """Translates structured pipeline outputs into human-readable reasoning.

    Deterministic and evidence-only: every explanation is derived from the
    supplied structured inputs (result, context, and optional validation /
    metrics / candidates). Consumer models are never asked to "explain
    themselves"; no LLM is involved anywhere in the pipeline.
    """

    @abstractmethod
    def explain(
        self,
        result: ScheduleResult,
        context: dict,
        validation: ScheduleValidationResult | None = None,
        metrics: ScheduleMetrics | None = None,
        candidates: list[BlockCandidate | IntegratedBlockCandidate] | None = None,
    ) -> ExplainabilityResult:
        """Produce structured, evidence-backed explanations for a schedule.

        Phase 6: the concrete service returns a :class:`ExplainabilityResult`
        whose records cover scheduled/unscheduled tasks, integrated blocks,
        validation errors vs warnings and metric summaries. When ``validation``
        is omitted, ``schedule_valid`` stays ``None`` (never inferred from the
        solver status); when ``candidates`` are supplied, per-candidate
        evidence (conflict detail, search truncation) is included.
        """


__all__ = [
    "CandidateGenerator",
    "ConstraintEngine",
    "IntegratedBlockDetector",
    "ScheduleOptimizer",
    "ScheduleValidator",
    "MetricsCalculator",
    "ExplainabilityService",
]