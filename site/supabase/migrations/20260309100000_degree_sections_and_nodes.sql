-- Phase 1: Degree requirement sections and nestable requirement nodes.
-- Adds two new tables that let users build tree-structured requirement
-- templates inside each degree_program, plus supporting columns.

-- ──────────────────────────────────────────────
-- 1. degree_requirement_sections
-- ──────────────────────────────────────────────
create table if not exists public.degree_requirement_sections (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.degree_programs(id) on delete cascade,
  title         text not null,
  section_type  text not null default 'all_required'
                  check (section_type in ('all_required', 'choose_n')),
  min_count     int,
  min_credits   numeric(4,2),
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_dreq_sections_program
  on public.degree_requirement_sections(program_id, position);

-- ──────────────────────────────────────────────
-- 2. degree_requirement_nodes
-- ──────────────────────────────────────────────
create table if not exists public.degree_requirement_nodes (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid not null references public.degree_requirement_sections(id) on delete cascade,
  parent_id     uuid references public.degree_requirement_nodes(id) on delete cascade,
  node_type     text not null
                  check (node_type in ('AND_GROUP','OR_GROUP','COURSE','GEN_ED','WILDCARD')),
  -- COURSE leaf
  course_code   text,
  course_id     uuid references public.courses(id) on delete set null,
  -- GEN_ED leaf
  gen_ed_code   text references public.gen_ed_tags(code) on delete set null,
  -- WILDCARD leaf
  wildcard_dept  text,
  wildcard_level text,
  -- GROUP semantics
  min_count     int,
  min_credits   numeric(4,2),
  position      int not null default 0,
  label         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_dreq_nodes_section
  on public.degree_requirement_nodes(section_id);
create index if not exists idx_dreq_nodes_parent
  on public.degree_requirement_nodes(parent_id);
create index if not exists idx_dreq_nodes_course
  on public.degree_requirement_nodes(course_id) where course_id is not null;

-- ──────────────────────────────────────────────
-- 3. plan_terms – optional primary_schedule_id
-- ──────────────────────────────────────────────
alter table public.plan_terms
  add column if not exists primary_schedule_id uuid
    references public.user_schedules(id) on delete set null;

-- ──────────────────────────────────────────────
-- 3b. user_schedules – JSONB snapshot of schedule selections
--     Stores full course+section state from API data so that
--     we can load schedules without the catalog sync having
--     populated public.sections. Relational schedule_sections
--     can be back-filled later once section IDs are resolved.
-- ──────────────────────────────────────────────
alter table public.user_schedules
  add column if not exists selections_json jsonb not null default '[]'::jsonb;

-- Also store term info directly so we don't need a terms FK for API-driven schedules
alter table public.user_schedules
  add column if not exists term_code text;
alter table public.user_schedules
  add column if not exists term_year int;

-- ──────────────────────────────────────────────
-- 4. user_prior_credits
-- ──────────────────────────────────────────────
create table if not exists public.user_prior_credits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.user_profiles(id) on delete cascade,
  source_type     text not null check (source_type in ('AP','IB','transfer','exemption','other')),
  original_name   text not null,
  umd_course_code text,
  course_id       uuid references public.courses(id) on delete set null,
  credits         numeric(4,2) not null,
  gen_ed_codes    text[] not null default '{}',
  term_awarded    text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_user_prior_credits_user
  on public.user_prior_credits(user_id);

-- ──────────────────────────────────────────────
-- 5. Extend overrides to reference new entities
-- ──────────────────────────────────────────────
alter table public.user_requirement_progress_overrides
  add column if not exists section_id uuid references public.degree_requirement_sections(id) on delete cascade;

alter table public.user_requirement_progress_overrides
  add column if not exists node_id uuid references public.degree_requirement_nodes(id) on delete cascade;

-- ──────────────────────────────────────────────
-- 6. RLS policies
-- ──────────────────────────────────────────────

-- degree_requirement_sections: readable by all, writable by authenticated
alter table public.degree_requirement_sections enable row level security;

drop policy if exists "dreq sections readable" on public.degree_requirement_sections;
create policy "dreq sections readable"
  on public.degree_requirement_sections for select using (true);

drop policy if exists "dreq sections writable" on public.degree_requirement_sections;
create policy "dreq sections writable"
  on public.degree_requirement_sections for all
  using (true) with check (true);

-- degree_requirement_nodes: readable by all, writable by authenticated
alter table public.degree_requirement_nodes enable row level security;

drop policy if exists "dreq nodes readable" on public.degree_requirement_nodes;
create policy "dreq nodes readable"
  on public.degree_requirement_nodes for select using (true);

drop policy if exists "dreq nodes writable" on public.degree_requirement_nodes;
create policy "dreq nodes writable"
  on public.degree_requirement_nodes for all
  using (true) with check (true);

-- user_prior_credits: user manages own
alter table public.user_prior_credits enable row level security;

drop policy if exists "users manage own prior credits" on public.user_prior_credits;
create policy "users manage own prior credits"
  on public.user_prior_credits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
