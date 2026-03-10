-- Ensure catalog views run with caller permissions and seed public.terms from orbit catalog terms.

-- 1) Security hardening: avoid SECURITY DEFINER behavior on catalog views.
do $$
begin
  if to_regclass('public.catalog_terms_v') is not null then
    execute 'alter view public.catalog_terms_v set (security_invoker = true)';
  end if;

  if to_regclass('public.catalog_courses_v') is not null then
    execute 'alter view public.catalog_courses_v set (security_invoker = true)';
  end if;

  if to_regclass('public.catalog_sections_v') is not null then
    execute 'alter view public.catalog_sections_v set (security_invoker = true)';
  end if;

  if to_regclass('public.catalog_meetings_v') is not null then
    execute 'alter view public.catalog_meetings_v set (security_invoker = true)';
  end if;
end $$;

-- 2) Data remediation: populate public.terms so schedule save can resolve term_id.
do $$
begin
  if to_regclass('orbit.catalog_terms') is not null then
    with src as (
      select
        year,
        lpad(trim(term_code::text), 2, '0') as tc
      from orbit.catalog_terms
      where year is not null
        and term_code is not null
    ), norm as (
      select
        (year::text || tc) as umd_term_code,
        year,
        case tc
          when '01' then 'spring'
          when '05' then 'summer'
          when '08' then 'fall'
          when '12' then 'winter'
          else null
        end as season
      from src
    )
    insert into public.terms (umd_term_code, year, season)
    select umd_term_code, year, season
    from norm
    where season is not null
    on conflict (umd_term_code) do update
      set year = excluded.year,
          season = excluded.season;
  end if;
end $$;
