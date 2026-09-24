# Module 2 — AI Intelligence Engine

*Owner: Module 2 Developer*

## Responsibilities
* Delay prediction models (LSTM / XGBoost / GNNs) based on historic telemetry and schedule deviations.
* Section run-time estimation.
* Conflict risk scoring & ETA anomaly detection.

## Data Contracts Integration
* Consumes canonical data structures from `packages/canonical-contracts/`.
* Fetches live network snapshots from Module 1 via `GET /api/v1/state/snapshot`.
