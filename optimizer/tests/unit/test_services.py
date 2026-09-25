"""Tests proving the service interfaces exist and enforce contracts."""

import abc

import pytest

from app.services import (
    CandidateGenerator,
    ConstraintEngine,
    IntegratedBlockDetector,
    MetricsCalculator,
    ScheduleOptimizer,
    ScheduleValidator,
)

INTERFACES = [
    CandidateGenerator,
    ConstraintEngine,
    IntegratedBlockDetector,
    ScheduleOptimizer,
    ScheduleValidator,
    MetricsCalculator,
]

INTERFACE_TO_METHOD = {
    CandidateGenerator: {"generate_candidates"},
    ConstraintEngine: {"validate"},
    IntegratedBlockDetector: {"detect"},
    ScheduleOptimizer: {"optimize"},
    ScheduleValidator: {"validate"},
    MetricsCalculator: {"compute"},
}


def test_interfaces_are_abstract_base_classes():
    for interface in INTERFACES:
        assert issubclass(interface, abc.ABC), interface.__name__


def test_each_interface_defines_expected_abstract_method():
    for interface in INTERFACES:
        assert getattr(interface, "__abstractmethods__", set()) == INTERFACE_TO_METHOD[interface]


def test_bare_subclass_cannot_be_instantiated():
    for interface in INTERFACES:
        with pytest.raises(TypeError):
            type("Stub", (interface,), {})()


def test_concrete_stub_raises_not_implemented():
    for interface in INTERFACES:
        method_name = next(iter(interface.__abstractmethods__))

        def _raise(*args, **kwargs):
            raise NotImplementedError(f"{interface.__name__}.{method_name} not implemented in Phase 1")

        concrete = type("ConcreteStub", (interface,), {method_name: _raise})()
        with pytest.raises(NotImplementedError):
            getattr(concrete, method_name)("ignored")