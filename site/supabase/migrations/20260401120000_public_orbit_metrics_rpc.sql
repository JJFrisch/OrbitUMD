-- Public aggregate metrics for landing page counters.
create or replace function public.get_orbit_public_metrics()
returns table (
  total_schedules_mapped bigint,
  total_majors_and_minors bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*)::bigint from public.user_schedules),
    (select count(*)::bigint from public.degree_programs where active = true);
$$;

grant execute on function public.get_orbit_public_metrics() to anon;
grant execute on function public.get_orbit_public_metrics() to authenticated;
