# RailOpt — Module 2: AI Intelligence Engine

The **AI Intelligence Engine** serves as the stateless decision-support intelligence layer for the **RailOpt Integrated Railway Maintenance Block Planner**.

It receives normalized maintenance block requests, asset information, and defect telemetry, computing multi-attribute priority scores, ISO 31000-aligned failure risk metrics, dual-layer explainability, and multi-department candidate integration groupings.

---

## 1. System Boundary & Module Responsibilities

Module 2 provides **decision-support intelligence only**. It **does not** generate final block schedules, select final start/end timestamps, resolve train or freight conflicts, allocate track windows, or optimize timetables. Those operational optimization functions belong strictly to **Module 3: Optimization Engine**.

```
[ Module 1: Data Hub ] ──► [ Cross-Module Contracts ] ──► [ Module 2: AI Intelligence Engine ]
                                                                      │
                                                        (Priority, Risk, Explainability,
                                                         Integration Candidate Hints)
                                                                      ▼
                                                          [ Module 3: Optimizer ] ──► [ Module 4: UI ]
```

---

## 2. Shared Canonical Contracts (`contracts/`)

Cross-module data interoperability is governed by repository-level JSON Schemas in `contracts/`:

- `contracts/asset.schema.json`
- `contracts/maintenance_task.schema.json`
- `contracts/defect.schema.json`
- `contracts/block_request.schema.json`
- `contracts/corridor.schema.json`
- `contracts/train.schema.json`
- `contracts/goods_forecast.schema.json`
- `contracts/resource.schema.json`
- `contracts/ai_recommendation.schema.json`
- `contracts/integration_candidate.schema.json`

Runtime Pydantic v2 adapters in `module-2-ai-engine/app/schemas/` consume and validate payloads against these cross-module specifications.

---

## 3. Priority Scoring Methodology

Priority scores ($0.0 - 100.0$) are calculated using Multi-Attribute Utility Theory (MAUT):

$$P = \min\left(100.0, \sum_{i} w_i \times S_i\right)$$

| Factor $S_i$ | Weight $w_i$ | Description |
| :--- | :---: | :--- |
| **Asset Criticality** | `0.20` | Base criticality boosted by configured asset types (`RAIL_FRACTURE: 95.0`, `POINT_SWITCH: 90.0`, etc.) |
| **Safety Impact** | `0.20` | Passenger & infrastructure safety consequence factor |
| **Defect Severity** | `0.15` | Defect telemetry severity rating |
| **Urgency** | `0.15` | Scaled by overdue factor: $1.0 + \min\left(1.5, \frac{\text{overdue\_days}}{14.0}\right)$ |
| **Failure Risk** | `0.15` | Component failure risk score |
| **Train Exposure** | `0.08` | Traffic density score |
| **Operational Impact** | `0.07` | Throughput and speed restriction penalty |

Priority Levels: `CRITICAL` ($\ge 85$), `HIGH` ($\ge 65$), `MEDIUM` ($\ge 40$), `LOW` ($< 40$).

---

## 4. ISO 31000-Aligned Risk Methodology

Risk is evaluated using an **ISO 31000-aligned probability $\times$ consequence decision-support model**:

$$\text{Consequence} = 0.40 \cdot \text{Safety} + 0.30 \cdot \text{Criticality} + 0.15 \cdot \text{Exposure} + 0.15 \cdot \text{Operational}$$
$$\text{Risk Score} = \min\left(100.0, \text{Failure Probability} \times \text{Consequence} \times 1.5\right)$$

Risk Levels: `EXTREME` ($\ge 80$), `HIGH` ($\ge 60$), `MODERATE` ($\ge 35$), `LOW` ($< 35$).

---

## 5. Dual-Layer Explainability

- **Machine-Readable Reason Codes**: Canonical codes (`HIGH_ASSET_CRITICALITY`, `SAFETY_RELATED_DEFECT`, `OVERDUE_MAINTENANCE`, `CRITICAL_DEFECT_SEVERITY`, `HIGH_FAILURE_RISK`, `HEAVY_TRAIN_EXPOSURE`, `SEVERE_OPERATIONAL_IMPACT`).
- **Deterministic Natural Language Explanation**: Plain English summaries detailing specific contributing metrics.

---

## 6. Integration Candidate Detection

Identifies multi-departmental (Engineering + Signalling + Traction) shadow block coordination candidates sharing identical spatial section corridors (`section`) with temporally compatible windows (within `candidate_matching.max_time_gap_minutes: 60`).

---

## 7. REST API Endpoints

- `POST /api/v1/evaluate/task`: Evaluates a single maintenance task.
- `POST /api/v1/evaluate/batch`: Evaluates a batch of tasks and attaches candidate grouping metadata.
- `GET /api/v1/scoring/weights`: Retrieves active scoring configuration weights and asset boosts.
- `POST /api/v1/candidate/match`: Standalone detection of multi-department candidate groups.
- `GET /api/v1/health`: Liveness probe (`status: healthy`).

---

## 8. Configuration & Environment Settings

Scoring weights, overdue multipliers, asset boosts, and risk thresholds are defined in `config/scoring_weights.yaml`.
Environment variables (`.env`):
- `API_KEY_SECRET`: Required in production (`app_env == "production"`).
- `CORS_ALLOWED_ORIGINS`: Comma-separated allowed origins (e.g. `http://localhost:3000,http://localhost:5173`).

---

## 9. Running Locally & Testing

```bash
# Install dependencies
pip install -r module-2-ai-engine/requirements.txt

# Run synthetic data generator (15 scenarios)
python module-2-ai-engine/scripts/generate_synthetic_data.py

# Run Pytest suite
$env:PYTHONPATH="module-2-ai-engine"; python -m pytest module-2-ai-engine/tests -v

# Run custom test runner
python module-2-ai-engine/scripts/run_tests.py

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
```

---

## 10. Disclaimer
Scoring weightings, overdue scaling formulas, and risk multiplier factors represent a **prototype decision-support scoring methodology** designed for SIH demonstration and domain expert calibration, not official Indian Railways standard operating formulas.
