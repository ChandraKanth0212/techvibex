# RAILOPT — Command Center UI (Module 4)

AI-Powered Integrated Railway Maintenance Block Planning System — Frontend Command Center.

## Technology Stack
- **Framework:** React 18 with TypeScript & Vite
- **Styling:** Tailwind CSS with custom Railway Command Center theme
- **Routing:** React Router v7
- **Data Fetching & Caching:** TanStack Query (React Query)
- **Icons:** Lucide React
- **Data Visualization:** Recharts

## Setup and Running

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open the application in your browser:
   `http://localhost:3000`

## Project Structure
```text
frontend/
├── src/
│   ├── components/       # Layout, Dashboard, Maintenance, Blocks, Planner, Conflicts, AI, Analytics
│   ├── pages/            # Page components for each route
│   ├── layouts/          # Main Application Shell & Navigation
│   ├── services/         # API Configuration & Service Abstraction Layer
│   ├── adapters/         # Pure Module 3 (Optimization Engine) -> Module 4 mappers
│   ├── hooks/            # Custom React Hooks
│   ├── types/            # TypeScript interfaces & domain models
│   ├── mocks/            # Mock Data Adapters
│   ├── utils/            # Helper utilities
│   └── lib/              # Class utilities & QueryClient singleton
```

## Module 3 Optimizer Integration (Phase 9A)

The real Module 3 API client is **opt-in**; the mock services stay in charge by default.

| Concern | Where |
| --- | --- |
| Transport (fetch, AbortSignal, `x-request-id`, error envelope) | `src/services/optimizerClient.ts` |
| Typed service functions + client-side `plan_id` state | `src/services/optimizerService.ts`, `src/services/optimizerPlanState.ts` |
| Wire DTOs (snake_case) and Module 4 view models | `src/types/optimizer.ts` |
| Explicit pure mappers | `src/adapters/optimizer.ts` |

Enable it in `.env`:

```bash
VITE_USE_REAL_OPTIMIZER_API=true
VITE_MODULE_3_OPTIMIZER_API=http://localhost:5002   # origin only, no /api/v1 prefix
```

Endpoints used: `GET /health`, `POST /api/optimizer/generate`,
`POST /api/optimizer/candidates`, `POST /api/optimizer/integrated-blocks/discover`,
`POST /api/optimizer/validate`, `GET /api/optimizer/plans/{plan_id}`,
`GET /api/optimizer/plans/{plan_id}/metrics`, `GET /api/optimizer/plans/{plan_id}/conflicts`.

Module 3 exposes no plan-list endpoint, so the `plan_id` returned by `generatePlan()` is kept in
client state and reused for the plan, metrics and conflicts reads. Module 3 storage is
`IN_MEMORY` (`data_mode` is `SYNTHETIC_DEMO`): plans do not survive a Module 3 restart, and a
`404 NOT_FOUND` marks the stored id as unavailable instead of being retried.

### Unresolved mappings (do not fill these in without a product decision)

`UNRESOLVED_OPTIMIZER_MAPPINGS` in `src/types/optimizer.ts` is the registry. The adapters carry
each one as a `null` Module 4 field plus a `status: 'UNRESOLVED'` marker:

- Module 3 `block_type` (`SINGLE | INTEGRATED`) -> Module 4 `BlockType`
  (`CORRIDOR | SHADOW | EMERGENCY | ROUTINE`)
- Module 3 `objective_value` -> Module 4 `ObjectiveSummary.efficiencyScore`
- Module 3 violation `severity` -> Module 4 `ConflictSeverity`
- Module 3 `*_urgent_tasks` -> Module 4 `CRITICAL`
- `risk` -> `priority`, `confidence` -> score

## Testing

```bash
npm test        # vitest: transport, service/plan state, adapters
npm run build   # tsc typecheck + vite build
```

