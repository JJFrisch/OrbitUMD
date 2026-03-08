-- Track scheduled and manual UMD import runs for observability.
create table if not exists public.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null default 'workflow',
  term_codes text[] not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  synced_courses int not null default 0,
  synced_sections int not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_catalog_sync_runs_started_at on public.catalog_sync_runs (started_at desc);

alter table public.catalog_sync_runs enable row level security;

-- Read access is restricted to signed-in users; writes should use service role from automation.
drop policy if exists "catalog sync runs readable" on public.catalog_sync_runs;
create policy "catalog sync runs readable"
  on public.catalog_sync_runs for select using (auth.role() = 'authenticated');
