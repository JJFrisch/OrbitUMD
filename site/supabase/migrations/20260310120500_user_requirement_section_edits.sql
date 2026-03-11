-- Per-user custom requirement section edits for scraped programs.
-- This keeps user-authored section changes synced across devices.

create table if not exists public.user_requirement_section_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  program_key text not null,
  sections_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, program_key)
);

create index if not exists idx_user_requirement_section_edits_user
  on public.user_requirement_section_edits(user_id);

alter table public.user_requirement_section_edits enable row level security;

drop policy if exists "users manage own requirement section edits" on public.user_requirement_section_edits;
create policy "users manage own requirement section edits"
  on public.user_requirement_section_edits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
