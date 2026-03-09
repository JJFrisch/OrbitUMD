# OrbitUMD Data Sync

This folder contains a runnable starter for syncing catalog data into your own Postgres database.

## Files

- `schema.postgres.sql`: canonical schema for merged course/section/instructor data.
- `sync-worker.mjs`: Node worker that fetches Jupiter + UMD + PlanetTerp and upserts into Postgres.

## 1) One-time setup

1. Create a Postgres database and set `DATABASE_URL`.
2. Install root dependencies:

```bash
npm install
```

3. Apply schema:

```bash
psql "$DATABASE_URL" -f data-sync/schema.postgres.sql
```

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

## 3) Suggested production flow

- Run every 10-15 minutes for active term.
- Run nightly for upcoming terms.
- Add scheduler (GitHub Actions cron, Render cron, or server-side job).
- Add observability by querying `orbit.sync_runs` for status and counts.

## Notes

- Worker currently marks trigger as `manual`; if you add cron, pass and store `scheduled`.
- Meetings are refreshed section-by-section each sync to keep canonical records clean.
- Catalog term labels are auto-upserted into `orbit.catalog_terms`.
