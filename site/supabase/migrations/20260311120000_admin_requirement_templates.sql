-- Admin role support + official requirement templates for programs.

alter table if exists public.user_profiles
  add column if not exists role text not null default 'USER';

alter table if exists public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table if exists public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('USER', 'ADMIN'));

create table if not exists public.program_requirement_templates (
  id uuid primary key default gen_random_uuid(),
  program_key text not null unique,
  sections_json jsonb not null default '[]'::jsonb,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_program_requirement_templates_program_key
  on public.program_requirement_templates(program_key);

alter table public.program_requirement_templates enable row level security;

drop policy if exists "program templates readable" on public.program_requirement_templates;
create policy "program templates readable"
  on public.program_requirement_templates for select
  using (true);

drop policy if exists "program templates admin write" on public.program_requirement_templates;
create policy "program templates admin write"
  on public.program_requirement_templates for all
  using (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.role = 'ADMIN'
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.role = 'ADMIN'
    )
  );
