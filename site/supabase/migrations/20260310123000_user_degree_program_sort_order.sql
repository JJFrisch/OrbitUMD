alter table if exists public.user_degree_programs
  add column if not exists sort_order int;

create index if not exists idx_user_degree_programs_user_sort_order
  on public.user_degree_programs (user_id, sort_order);
