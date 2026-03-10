-- Allow authenticated clients to resolve/create a valid public.terms row
-- without granting direct INSERT privileges on public.terms.

create or replace function public.ensure_term_row(p_year int, p_term_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term_code text := lpad(trim(coalesce(p_term_code, '')), 2, '0');
  v_season text;
  v_umd_term_code text;
  v_term_id uuid;
begin
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Invalid term year: %', p_year using errcode = '22023';
  end if;

  case v_term_code
    when '01' then v_season := 'spring';
    when '05' then v_season := 'summer';
    when '08' then v_season := 'fall';
    when '12' then v_season := 'winter';
    else
      raise exception 'Invalid term code: %', p_term_code using errcode = '22023';
  end case;

  v_umd_term_code := p_year::text || v_term_code;

  select id into v_term_id
  from public.terms
  where umd_term_code = v_umd_term_code
  limit 1;

  if v_term_id is not null then
    return v_term_id;
  end if;

  insert into public.terms (umd_term_code, year, season)
  values (v_umd_term_code, p_year, v_season)
  on conflict (umd_term_code) do update
    set year = excluded.year,
        season = excluded.season
  returning id into v_term_id;

  return v_term_id;
end;
$$;

revoke all on function public.ensure_term_row(int, text) from public;
grant execute on function public.ensure_term_row(int, text) to authenticated;
grant execute on function public.ensure_term_row(int, text) to service_role;
