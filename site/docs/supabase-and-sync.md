# Supabase Repositories And UMD Sync

## Client and repository layer
- `src/lib/supabase/client.ts`: shared browser Supabase client + authenticated user helper.
- `src/lib/repositories/userSchedulesRepository.ts`: CRUD for `user_schedules` and `schedule_sections`.
- `src/lib/repositories/fourYearPlansRepository.ts`: CRUD for `four_year_plans`, `plan_terms`, and `plan_term_courses`.
- `src/lib/api/planner.ts`: typed aggregation API for planner features.

## UMD import job
- Script: `scripts/sync-umd-catalog.mjs`
- Command: `npm run sync:umd`
- Workflow: `.github/workflows/sync-umd-catalog.yml`

### Required environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `UMD_SYNC_TERMS` (comma-separated term codes)
- Optional: `UMD_SYNC_PAGE_SIZE`, `UMD_SYNC_MAX_COURSES_PER_TERM`

### Behavior
1. Pull terms from UMD API or provided `UMD_SYNC_TERMS`.
2. Upsert term rows in `terms`.
3. Fetch paginated courses by term and upsert into `courses`.
4. Upsert Gen Ed tag metadata and course-tag links.
5. Fetch sections/meetings and upsert into `sections` and `section_meetings`.

The importer is idempotent and can run nightly or be triggered manually from Actions.
