---
name: OrbitUMD project overview
description: Core tech stack, architecture, and key file locations for OrbitUMD
type: project
---

OrbitUMD is a React 18 + TypeScript + Vite + Supabase web app for UMD students to plan 4-year degree paths, build schedules, and track Gen Ed requirements.

**Stack:** React 18, Vite 6, Tailwind CSS v4, Zustand 5, Radix UI, react-dnd, Supabase (PostgreSQL + Auth), react-router v7, pdfjs-dist, recharts.

**Main pages:** Dashboard, FourYearPlan, ScheduleBuilder (CoursePlannerPage), ScheduleLibrary, AutoGenerateSchedule, DegreeAuditV2, GenEds, CreditImport, Suggestions, Settings, Onboarding.

**Key paths:**
- `site/src/app/pages/` — all page components
- `site/src/features/coursePlanner/` — schedule builder feature
- `site/src/lib/` — API, requirements engine, repositories, Supabase client
- `site/src/app/components/` — Sidebar, GlobalSearch, PageOnboardingTour, shared components
- `data-sync/` — Node.js catalog sync worker
- `catalog-scraper/` — UMD program requirements scraper

**Why:** Built by UMD students for UMD students as a capstone/demo project for professors.
