import sys
import os
from pathlib import Path

import pytest

# Add canonical contracts package and module1 src directory to sys.path
root_dir = Path(__file__).resolve().parents[2]
contracts_dir = root_dir / "packages" / "canonical-contracts"
mod1_src_dir = root_dir / "modules" / "module1-data-hub"

sys.path.insert(0, str(contracts_dir))
sys.path.insert(0, str(mod1_src_dir))


@pytest.fixture(autouse=True)
def reset_simulator_instance():
    """Give every test a fresh SimulationEngine (isolated, order-independent state)."""
    from src.synthetic.simulator import simulator_instance

    # Re-initialise the shared singleton in place so tests never observe
    # simulation state mutated by an earlier test, regardless of order.
    simulator_instance.__init__()
    yield
