# OrbitUMD Architecture Baseline

## Frontend stack
- React + Vite + TypeScript
- React Router for app routing
- Tailwind CSS + component primitives generated from Figma import

## Backend stack
- Supabase Postgres + Auth + Row Level Security
- Migration-first schema under `supabase/migrations`
- Course catalog sync from UMD main API (`api.umd.io/v1`)

## Data flow
1. Frontend calls `src/lib/api/umdCourses.ts` for live UMD catalog/sections.
2. Scheduled imports sync UMD data into Postgres catalog tables.
3. User-owned schedules, plans, and requirement overrides persist in Supabase.
4. Calendar UI consumes section meetings + conflict utility in `src/lib/scheduling/conflicts.ts`.
