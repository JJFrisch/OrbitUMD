# OrbitUMD Data Sync

This folder contains a runnable starter for syncing catalog data into your own Postgres database.

## Files

- `schema.postgres.sql`: canonical schema for merged course/section/instructor data.
- `sync-worker.mjs`: Node worker that fetches Jupiter + UMD + PlanetTerp and upserts into Postgres.

## 1) One-time setup

1. Create a Postgres database and set `DATABASE_URL`.
	- For Supabase, use the connection string from Project Settings -> Database -> Connection string.
	- Sync runs will fail with `Missing DATABASE_URL for non-dry-run execution` until this is set.
2. Install root dependencies:

```bash
npm install
```

3. Apply schema:

```bash
psql "$DATABASE_URL" -f data-sync/schema.postgres.sql
```

4. If you run the site against Supabase, also apply the site migration that exposes read-only catalog views used by the frontend:

```bash
cd site
supabase db push
```

The migration `site/supabase/migrations/20260309001000_orbit_catalog_schema.sql` creates:
- `orbit.*` sync tables (including `orbit.sync_watermarks`)
- `public.catalog_*_v` views for browser-safe class reads

## 2) Run sync

Dry run (fetch + merge only, no DB writes):

```bash
JUPITER_BASE_URL="https://your-jupiter.example" \
UMD_BASE_URL="https://api.umd.io/v1" \
PLANETTERP_BASE_URL="https://planetterp.com/api/v1" \
npm run sync:catalog:dry -- --term=Fall --year=2026
```

Real sync (writes to DB):

```bash
DATABASE_URL="postgres://user:pass@host:5432/dbname" \
JUPITER_BASE_URL="https://your-jupiter.example" \
UMD_BASE_URL="https://api.umd.io/v1" \
PLANETTERP_BASE_URL="https://planetterp.com/api/v1" \
npm run sync:catalog -- --term=Fall --year=2026
```

Optional flags:

- `--section-batch-size=12`: number of courses fetched in parallel per batch for UMD section calls.
- `--incremental=false`: force full write path and ignore watermark short-circuit.
- `--force-full=true`: same as above, but explicit override when incremental mode is enabled.
- `--trigger=scheduled`: mark run as scheduled in `orbit.sync_runs`.

## 3) Suggested production flow

- Run every 10-15 minutes for active term.
- Run nightly for upcoming terms.
- Add scheduler (GitHub Actions cron, Render cron, or server-side job).
- Add observability by querying `orbit.sync_runs` for status and counts.

## 4) Behavior implemented

- Batched parallel section fetching for faster sync runtime.
- Stale cleanup for removed courses/sections within the synced term-year.
- Incremental watermark short-circuit via `orbit.sync_watermarks` when upstream payload hashes are unchanged.

## Notes

- Meetings are refreshed section-by-section each sync to keep canonical records clean.
- Catalog term labels are auto-upserted into `orbit.catalog_terms`.
- Browser clients should read via Supabase (`public.catalog_*_v`), not direct `api.umd.io` requests, because UMD API does not reliably provide CORS headers.
