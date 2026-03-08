-- OrbitUMD initial relational schema for Supabase/Postgres
-- Designed for term schedules, four-year plans, and requirement tracking.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  display_name text,
  university_uid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  umd_term_code text not null unique,
  year int not null,
  season text not null check (season in ('winter', 'spring', 'summer', 'fall')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create index if not exists idx_terms_year_season on public.terms (year, season);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  umd_course_id text not null unique,
  dept_id text not null,
  course_number text not null,
  title text not null,
  description text,
  min_credits numeric(4,2) not null,
  max_credits numeric(4,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_courses_dept_number on public.courses (dept_id, course_number);
create index if not exists idx_courses_title_trgm on public.courses using gin (to_tsvector('english', title));

create table if not exists public.gen_ed_tags (
  code text primary key,
  label text not null,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.course_gen_ed_tags (
  course_id uuid not null references public.courses (id) on delete cascade,
  gen_ed_code text not null references public.gen_ed_tags (code) on delete restrict,
  primary key (course_id, gen_ed_code)
);

create index if not exists idx_course_gen_ed_tags_gened on public.course_gen_ed_tags (gen_ed_code);

create table if not exists public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  unique (course_id, term_id)
);

create index if not exists idx_course_offerings_term on public.course_offerings (term_id);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings (id) on delete cascade,
  umd_section_id text not null,
  section_code text not null,
  instructor_name text,
  seat_capacity int,
  seat_open int,
  waitlist_capacity int,
  waitlist_open int,
  created_at timestamptz not null default now(),
  unique (offering_id, umd_section_id)
);

create index if not exists idx_sections_offering on public.sections (offering_id);

create table if not exists public.section_meetings (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  meeting_type text,
  days text[] not null,
  start_minutes int not null check (start_minutes >= 0 and start_minutes < 1440),
  end_minutes int not null check (end_minutes > start_minutes and end_minutes <= 1440),
  location text,
  building_code text,
  room text,
  created_at timestamptz not null default now()
);

create index if not exists idx_section_meetings_section on public.section_meetings (section_id);
create index if not exists idx_section_meetings_time on public.section_meetings (start_minutes, end_minutes);

create table if not exists public.user_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  name text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, term_id, name)
);

create unique index if not exists idx_user_schedules_primary_term
  on public.user_schedules (user_id, term_id)
  where is_primary = true;

create table if not exists public.schedule_sections (
  schedule_id uuid not null references public.user_schedules (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete cascade,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (schedule_id, section_id)
);

create index if not exists idx_schedule_sections_section on public.schedule_sections (section_id);

create table if not exists public.four_year_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  name text not null,
  start_term_id uuid references public.terms (id) on delete set null,
  target_graduation_term_id uuid references public.terms (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.plan_terms (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.four_year_plans (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  position int not null,
  notes text,
  unique (plan_id, term_id),
  unique (plan_id, position)
);

create table if not exists public.plan_term_courses (
  id uuid primary key default gen_random_uuid(),
  plan_term_id uuid not null references public.plan_terms (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  planned_credits numeric(4,2),
  source_schedule_id uuid references public.user_schedules (id) on delete set null,
  position int,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'dropped')),
  unique (plan_term_id, course_id)
);

create table if not exists public.degree_programs (
  id uuid primary key default gen_random_uuid(),
  program_code text not null unique,
  name text not null,
  college text,
  degree_type text,
  catalog_year text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.degree_requirements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.degree_programs (id) on delete cascade,
  requirement_code text not null,
  title text not null,
  requirement_group text,
  min_courses int,
  min_credits numeric(4,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (program_id, requirement_code)
);

create index if not exists idx_degree_requirements_program on public.degree_requirements (program_id);

create table if not exists public.requirement_course_rules (
  requirement_id uuid not null references public.degree_requirements (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  rule_type text not null default 'allowed' check (rule_type in ('allowed', 'required', 'excluded')),
  primary key (requirement_id, course_id)
);

create table if not exists public.requirement_gen_ed_rules (
  requirement_id uuid not null references public.degree_requirements (id) on delete cascade,
  gen_ed_code text not null references public.gen_ed_tags (code) on delete cascade,
  min_courses int,
  primary key (requirement_id, gen_ed_code)
);

create table if not exists public.user_degree_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  program_id uuid not null references public.degree_programs (id) on delete cascade,
  is_primary boolean not null default false,
  started_term_id uuid references public.terms (id) on delete set null,
  expected_graduation_term_id uuid references public.terms (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, program_id)
);

create unique index if not exists idx_user_degree_programs_primary
  on public.user_degree_programs (user_id)
  where is_primary = true;

create table if not exists public.user_requirement_progress_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  requirement_id uuid not null references public.degree_requirements (id) on delete cascade,
  is_waived boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  unique (user_id, requirement_id)
);

-- Row-level security
alter table public.user_profiles enable row level security;
alter table public.user_schedules enable row level security;
alter table public.schedule_sections enable row level security;
alter table public.four_year_plans enable row level security;
alter table public.plan_terms enable row level security;
alter table public.plan_term_courses enable row level security;
alter table public.user_degree_programs enable row level security;
alter table public.user_requirement_progress_overrides enable row level security;

-- Catalog/reference tables are readable to all authenticated and anonymous clients.
alter table public.terms enable row level security;
alter table public.courses enable row level security;
alter table public.gen_ed_tags enable row level security;
alter table public.course_gen_ed_tags enable row level security;
alter table public.course_offerings enable row level security;
alter table public.sections enable row level security;
alter table public.section_meetings enable row level security;
alter table public.degree_programs enable row level security;
alter table public.degree_requirements enable row level security;
alter table public.requirement_course_rules enable row level security;
alter table public.requirement_gen_ed_rules enable row level security;

drop policy if exists "profiles self-select" on public.user_profiles;
create policy "profiles self-select"
  on public.user_profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles self-upsert" on public.user_profiles;
create policy "profiles self-upsert"
  on public.user_profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "users manage own schedules" on public.user_schedules;
create policy "users manage own schedules"
  on public.user_schedules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own schedule sections" on public.schedule_sections;
create policy "users manage own schedule sections"
  on public.schedule_sections for all
  using (
    exists (
      select 1
      from public.user_schedules us
      where us.id = schedule_sections.schedule_id
        and us.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_schedules us
      where us.id = schedule_sections.schedule_id
        and us.user_id = auth.uid()
    )
  );

drop policy if exists "users manage own plans" on public.four_year_plans;
create policy "users manage own plans"
  on public.four_year_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own plan terms" on public.plan_terms;
create policy "users manage own plan terms"
  on public.plan_terms for all
  using (
    exists (
      select 1
      from public.four_year_plans p
      where p.id = plan_terms.plan_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.four_year_plans p
      where p.id = plan_terms.plan_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "users manage own plan courses" on public.plan_term_courses;
create policy "users manage own plan courses"
  on public.plan_term_courses for all
  using (
    exists (
      select 1
      from public.plan_terms pt
      join public.four_year_plans p on p.id = pt.plan_id
      where pt.id = plan_term_courses.plan_term_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.plan_terms pt
      join public.four_year_plans p on p.id = pt.plan_id
      where pt.id = plan_term_courses.plan_term_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "users manage own degree links" on public.user_degree_programs;
create policy "users manage own degree links"
  on public.user_degree_programs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own progress overrides" on public.user_requirement_progress_overrides;
create policy "users manage own progress overrides"
  on public.user_requirement_progress_overrides for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "terms readable" on public.terms;
create policy "terms readable"
  on public.terms for select using (true);

drop policy if exists "courses readable" on public.courses;
create policy "courses readable"
  on public.courses for select using (true);

drop policy if exists "geneds readable" on public.gen_ed_tags;
create policy "geneds readable"
  on public.gen_ed_tags for select using (true);

drop policy if exists "course-geneds readable" on public.course_gen_ed_tags;
create policy "course-geneds readable"
  on public.course_gen_ed_tags for select using (true);

drop policy if exists "offerings readable" on public.course_offerings;
create policy "offerings readable"
  on public.course_offerings for select using (true);

drop policy if exists "sections readable" on public.sections;
create policy "sections readable"
  on public.sections for select using (true);

drop policy if exists "meetings readable" on public.section_meetings;
create policy "meetings readable"
  on public.section_meetings for select using (true);

drop policy if exists "degree programs readable" on public.degree_programs;
create policy "degree programs readable"
  on public.degree_programs for select using (true);

drop policy if exists "degree requirements readable" on public.degree_requirements;
create policy "degree requirements readable"
  on public.degree_requirements for select using (true);

drop policy if exists "requirement course rules readable" on public.requirement_course_rules;
create policy "requirement course rules readable"
  on public.requirement_course_rules for select using (true);

drop policy if exists "requirement gened rules readable" on public.requirement_gen_ed_rules;
create policy "requirement gened rules readable"
  on public.requirement_gen_ed_rules for select using (true);
