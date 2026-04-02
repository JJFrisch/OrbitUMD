-- Server-side course search index + browser cache version source.

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

create index if not exists idx_orbit_course_search_index_term
  on orbit.course_search_index(term_code, year, dept_id, course_code);

create index if not exists idx_orbit_course_search_index_vector
  on orbit.course_search_index using gin (search_vector);

create index if not exists idx_orbit_course_search_index_geneds
  on orbit.course_search_index using gin (geneds);

create index if not exists idx_orbit_course_search_index_code_trgm
  on orbit.course_search_index using gin (course_code gin_trgm_ops);

create index if not exists idx_orbit_course_search_index_name_trgm
  on orbit.course_search_index using gin (name gin_trgm_ops);

create or replace view public.catalog_sync_state_v as
select
  sync_run_id,
  catalog_version,
  status,
  started_at,
  completed_at,
  summary
from (
  select
    s.id as sync_run_id,
    concat(s.id::text, ':', to_char(coalesce(s.ended_at, s.started_at), 'YYYYMMDDHH24MISSUS')) as catalog_version,
    s.status,
    s.started_at,
    s.ended_at as completed_at,
    s.summary,
    row_number() over (order by coalesce(s.ended_at, s.started_at) desc, s.id desc) as rn
  from orbit.sync_runs s
  where s.status in ('success', 'partial')
) ranked
where rn = 1;

create or replace function public.search_catalog_courses(
  query text,
  term_code text default null,
  dept_id text default null,
  gen_ed_tag text default null,
  limit_count integer default 20
)
returns table (
  course_code text,
  term_code text,
  year integer,
  name text,
  dept_id text,
  credits numeric(4,2),
  min_credits numeric(4,2),
  max_credits numeric(4,2),
  geneds text[],
  description text,
  rank real
)
language sql
stable
security definer
set search_path = public, orbit, pg_temp
as $$
with params as (
  select
    nullif(trim(query), '') as normalized_query,
    nullif(trim(term_code), '') as requested_term_code,
    nullif(trim(dept_id), '') as requested_dept_id,
    nullif(trim(gen_ed_tag), '') as requested_gen_ed_tag,
    greatest(coalesce(limit_count, 20), 1) as requested_limit
),
latest_terms as (
  select distinct on (season_key)
    term_code,
    year,
    season_key
  from (
    select
      ct.term_code,
      ct.year,
      case ct.term_code
        when '12' then 'winter'
        when '01' then 'spring'
        when '05' then 'summer'
        else 'fall'
      end as season_key
    from orbit.catalog_terms ct
    where ct.active = true
  ) terms
  order by season_key, year desc, term_code desc
),
scoped_terms as (
  select lt.term_code, lt.year
  from latest_terms lt, params p
  where p.requested_term_code is null

  union all

  select ct.term_code, ct.year
  from orbit.catalog_terms ct, params p
  where p.requested_term_code is not null
    and ct.term_code = p.requested_term_code
    and ct.active = true
),
scoped_courses as (
  select
    i.*,
    params.normalized_query,
    params.requested_dept_id,
    params.requested_gen_ed_tag,
    params.requested_limit,
    case
      when params.normalized_query is null then 0::real
      else ts_rank_cd(i.search_vector, websearch_to_tsquery('english', params.normalized_query))
    end as text_rank,
    case
      when params.normalized_query is null then 0::real
      else similarity(i.course_code, params.normalized_query)
    end as code_rank,
    case
      when params.normalized_query is null then 0::real
      else similarity(i.name, params.normalized_query)
    end as name_rank
  from orbit.course_search_index i
  join scoped_terms t
    on t.term_code = i.term_code
   and t.year = i.year
  cross join params
  where (params.requested_dept_id is null or i.dept_id = params.requested_dept_id)
    and (params.requested_gen_ed_tag is null or i.geneds @> array[params.requested_gen_ed_tag])
    and (
      params.normalized_query is null
      or i.search_vector @@ websearch_to_tsquery('english', params.normalized_query)
      or i.course_code ilike params.normalized_query || '%'
      or i.name ilike '%' || params.normalized_query || '%'
      or i.dept_id ilike params.normalized_query || '%'
    )
)
select
  course_code,
  term_code,
  year,
  name,
  dept_id,
  credits,
  min_credits,
  max_credits,
  geneds,
  description,
  greatest(text_rank, code_rank, name_rank) as rank
from scoped_courses
order by rank desc, year desc, term_code desc, course_code asc
limit (select requested_limit from params);
$$;

create or replace function public.get_catalog_search_seed(limit_count integer default 5000)
returns table (
  course_code text,
  term_code text,
  year integer,
  name text,
  dept_id text,
  credits numeric(4,2),
  min_credits numeric(4,2),
  max_credits numeric(4,2),
  geneds text[],
  description text,
  search_text text,
  source_fingerprint text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, orbit, pg_temp
as $$
with latest_terms as (
  select distinct on (season_key)
    term_code,
    year,
    season_key
  from (
    select
      ct.term_code,
      ct.year,
      case ct.term_code
        when '12' then 'winter'
        when '01' then 'spring'
        when '05' then 'summer'
        else 'fall'
      end as season_key
    from orbit.catalog_terms ct
    where ct.active = true
  ) terms
  order by season_key, year desc, term_code desc
)
select
  i.course_code,
  i.term_code,
  i.year,
  i.name,
  i.dept_id,
  i.credits,
  i.min_credits,
  i.max_credits,
  i.geneds,
  i.description,
  i.search_text,
  i.source_fingerprint,
  i.updated_at
from orbit.course_search_index i
join latest_terms t
  on t.term_code = i.term_code
 and t.year = i.year
order by i.year desc, i.term_code desc, i.course_code asc
limit greatest(coalesce(limit_count, 5000), 1);
$$;

grant select on public.catalog_sync_state_v to anon, authenticated;
grant execute on function public.search_catalog_courses(text, text, text, text, integer) to anon, authenticated;
grant execute on function public.get_catalog_search_seed(integer) to anon, authenticated;
