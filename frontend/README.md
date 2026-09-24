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
│   ├── hooks/            # Custom React Hooks
│   ├── types/            # TypeScript interfaces & domain models
│   ├── mocks/            # Mock Data Adapters
│   ├── utils/            # Helper utilities
│   └── lib/              # Class utilities & QueryClient singleton
```
