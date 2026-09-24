import sys
import os
from pathlib import Path

# Add canonical contracts package and module1 src directory to sys.path
root_dir = Path(__file__).resolve().parents[2]
contracts_dir = root_dir / "packages" / "canonical-contracts"
mod1_src_dir = root_dir / "modules" / "module1-data-hub"

sys.path.insert(0, str(contracts_dir))
sys.path.insert(0, str(mod1_src_dir))
