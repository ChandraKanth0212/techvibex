# RailOpt — Smart India Hackathon 2026

Real-Time Train Traffic Optimization and Command Center Platform for Indian Railways.

## Repository Architecture

This is a shared monorepo divided into four core functional modules and shared canonical data contracts:

* `packages/canonical-contracts/` — Shared Pydantic data models & contracts used across all modules.
* `modules/module1-data-hub/` — **Module 1: Data & Integration Hub** (Ingestion, Database, Telemetry Streams & Synthetic Generator).
* `modules/module2-ai-engine/` — **Module 2: AI Intelligence Engine** (Delay Prediction & Conflict Detection).
* `modules/module3-optimization/` — **Module 3: Optimization Engine** (Dynamic Rescheduling & Track Assignment Solvers).
* `modules/module4-command-center/` — **Module 4: Command Center Frontend** (GIS Dashboard & Monitoring UI).

## Quick Start (Infrastructure Setup)

1. Start PostgreSQL (with PostGIS) and Redis:
   ```bash
   docker compose up -d
   ```

2. Install shared canonical contracts package:
   ```bash
   pip install -e packages/canonical-contracts
   ```

3. Run Module 1 Backend:
   ```bash
   cd modules/module1-data-hub
   pip install -r requirements.txt
   uvicorn src.main:app --reload --port 8000
   ```
