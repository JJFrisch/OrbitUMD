-- Versioned requirement tree schema for ingestion + degree audit.

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  college text,
  degree_type text,
  catalog_year_start int not null,
  catalog_year_end int,
  min_credits int,
  source_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_programs_catalog_year
  on public.programs(catalog_year_start, catalog_year_end);

create table if not exists public.requirement_blocks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  parent_requirement_id uuid references public.requirement_blocks(id) on delete cascade,
  type text not null,
  params jsonb not null default '{}'::jsonb,
  human_label text not null,
  sort_order int not null default 0,
  source_note text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_requirement_blocks_program
  on public.requirement_blocks(program_id, sort_order);
create index if not exists idx_requirement_blocks_parent
  on public.requirement_blocks(parent_requirement_id);

create table if not exists public.requirement_items (
  id uuid primary key default gen_random_uuid(),
  requirement_block_id uuid not null references public.requirement_blocks(id) on delete cascade,
  item_type text not null,
  payload jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_requirement_items_block
  on public.requirement_items(requirement_block_id, sort_order);

create table if not exists public.student_courses (
  id uuid primary key default gen_random_uuid(),
  student_uid text not null,
  subject text not null,
  number text not null,
  title text not null,
  credits numeric(4,2) not null,
  grade text,
  term text,
  is_planned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_courses_student
  on public.student_courses(student_uid);

create table if not exists public.student_requirement_overrides (
  id uuid primary key default gen_random_uuid(),
  student_uid text not null,
  block_id uuid not null references public.requirement_blocks(id) on delete cascade,
  override_type text not null check (override_type in ('WAIVED', 'MANUALLY_SATISFIED', 'COURSE_SUBSTITUTION')),
  details jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_student_requirement_overrides_student
  on public.student_requirement_overrides(student_uid, block_id);

alter table public.programs enable row level security;
alter table public.requirement_blocks enable row level security;
alter table public.requirement_items enable row level security;
alter table public.student_courses enable row level security;
alter table public.student_requirement_overrides enable row level security;

drop policy if exists "programs readable" on public.programs;
create policy "programs readable"
  on public.programs for select using (true);

drop policy if exists "programs writable" on public.programs;
create policy "programs writable"
  on public.programs for all using (true) with check (true);

drop policy if exists "requirement blocks readable" on public.requirement_blocks;
create policy "requirement blocks readable"
  on public.requirement_blocks for select using (true);

drop policy if exists "requirement blocks writable" on public.requirement_blocks;
create policy "requirement blocks writable"
  on public.requirement_blocks for all using (true) with check (true);

drop policy if exists "requirement items readable" on public.requirement_items;
create policy "requirement items readable"
  on public.requirement_items for select using (true);

drop policy if exists "requirement items writable" on public.requirement_items;
create policy "requirement items writable"
  on public.requirement_items for all using (true) with check (true);

drop policy if exists "student courses own rows" on public.student_courses;
create policy "student courses own rows"
  on public.student_courses for all
  using (auth.uid()::text = student_uid)
  with check (auth.uid()::text = student_uid);

drop policy if exists "student overrides own rows" on public.student_requirement_overrides;
create policy "student overrides own rows"
  on public.student_requirement_overrides for all
  using (auth.uid()::text = student_uid)
  with check (auth.uid()::text = student_uid);
