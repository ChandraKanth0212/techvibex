# Module 3 — Optimization Engine

*Owner: Module 3 Developer*

## Responsibilities
* Real-time train rescheduling & track section allocation solvers (MILP / Heuristic / RL).
* Platform assignment optimization at bottleneck stations.
* Priority-aware conflict resolution during disruptions.

## Data Contracts Integration
* Consumes canonical data structures from `packages/canonical-contracts/`.
* Query current section occupancies and active disruptions from Module 1 (`GET /api/v1/state/*`).
