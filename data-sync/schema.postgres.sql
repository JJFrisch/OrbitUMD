-- OrbitUMD canonical course catalog schema (PostgreSQL)
-- Apply with: psql "$DATABASE_URL" -f data-sync/schema.postgres.sql

create schema if not exists orbit;

create table if not exists orbit.sync_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  trigger text not null check (trigger in ('manual', 'scheduled')),
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists orbit.sources (
  id text primary key,
  name text not null,
  base_url text not null,
  enabled boolean not null default true,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into orbit.sources(id, name, base_url)
values
  ('jupiter', 'Jupiter API', 'https://<your-jupiter-host>'),
  ('umd', 'UMD API', 'https://api.umd.io/v1'),
  ('planetterp', 'PlanetTerp API', 'https://planetterp.com/api/v1')
on conflict (id) do nothing;

create table if not exists orbit.catalog_terms (
  term_code text not null,
  year integer not null,
  label text not null,
  active boolean not null default true,
  primary key (term_code, year)
);

create table if not exists orbit.courses (
  course_code text not null,
  term_code text not null,
  year integer not null,
  name text not null,
  dept_id text,
  min_credits numeric(4,2),
  max_credits numeric(4,2),
  credits numeric(4,2),
  description text,
  geneds text[] not null default '{}',
  conditions jsonb,
  canonical_source text not null default 'jupiter' references orbit.sources(id),
  source_fingerprint text,
  merged_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_code, term_code, year)
);

create index if not exists idx_courses_lookup on orbit.courses(term_code, year, dept_id, course_code);
create index if not exists idx_courses_name_gin on orbit.courses using gin (to_tsvector('english', coalesce(name, '')));
create index if not exists idx_courses_geneds_gin on orbit.courses using gin (geneds);

create extension if not exists pg_trgm;

create table if not exists orbit.course_search_index (
  course_code text not null,
  term_code text not null,
  year integer not null,
  dept_id text not null,
  name text not null,
  credits numeric(4,2),
  min_credits numeric(4,2),
  max_credits numeric(4,2),
  geneds text[] not null default '{}',
  description text,
  search_text text not null,
  search_vector tsvector generated always as (to_tsvector('english', search_text)) stored,
  source_fingerprint text not null,
  updated_at timestamptz not null default now(),
  primary key (course_code, term_code, year)
);

create index if not exists idx_course_search_index_term on orbit.course_search_index(term_code, year, dept_id, course_code);
create index if not exists idx_course_search_index_vector on orbit.course_search_index using gin (search_vector);
create index if not exists idx_course_search_index_geneds on orbit.course_search_index using gin (geneds);
create index if not exists idx_course_search_index_code_trgm on orbit.course_search_index using gin (course_code gin_trgm_ops);
create index if not exists idx_course_search_index_name_trgm on orbit.course_search_index using gin (name gin_trgm_ops);

create table if not exists orbit.sections (
  section_key text primary key,
  course_code text not null,
  section_code text not null,
  term_code text not null,
  year integer not null,
  instructor text,
  instructors text[] not null default '{}',
  total_seats integer,
  open_seats integer,
  waitlist integer,
  holdfile integer,
  canonical_source text not null default 'jupiter' references orbit.sources(id),
  source_updated_at timestamptz,
  merge_conflicts jsonb,
  merged_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_sections_course foreign key (course_code, term_code, year)
    references orbit.courses(course_code, term_code, year) on delete cascade
);

create index if not exists idx_sections_course on orbit.sections(course_code, term_code, year);
create index if not exists idx_sections_open on orbit.sections(term_code, year, open_seats);

create table if not exists orbit.meetings (
  id bigserial primary key,
  section_key text not null references orbit.sections(section_key) on delete cascade,
  days text,
  start_time text,
  end_time text,
  building text,
  room text,
  location text,
  classtype text,
  canonical_key text generated always as (
    coalesce(lower(days), '') || '|' ||
    coalesce(lower(start_time), '') || '|' ||
    coalesce(lower(end_time), '') || '|' ||
    coalesce(lower(building), '') || '|' ||
    coalesce(lower(room), '') || '|' ||
    coalesce(lower(location), '') || '|' ||
    coalesce(lower(classtype), '')
  ) stored
);

create unique index if not exists uniq_meeting_per_section on orbit.meetings(section_key, canonical_key);

create table if not exists orbit.instructors (
  normalized_name text primary key,
  display_name text not null,
  planetterp_slug text,
  average_rating numeric(3,2),
  rating_count integer,
  ambiguous boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists orbit.source_snapshots (
  id bigserial primary key,
  source_id text not null references orbit.sources(id),
  resource_type text not null,
  term_code text,
  year integer,
  snapshot_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_snapshots_resource on orbit.source_snapshots(source_id, resource_type, term_code, year);

create table if not exists orbit.sync_watermarks (
  source_id text not null references orbit.sources(id),
  resource_type text not null,
  watermark text,
  updated_at timestamptz not null default now(),
  primary key (source_id, resource_type)
);

create or replace function orbit.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_courses_touch on orbit.courses;
create trigger trg_courses_touch before update on orbit.courses
for each row execute function orbit.touch_updated_at();

drop trigger if exists trg_sections_touch on orbit.sections;
create trigger trg_sections_touch before update on orbit.sections
for each row execute function orbit.touch_updated_at();
