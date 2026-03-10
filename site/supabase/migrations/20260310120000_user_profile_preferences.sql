alter table if exists public.user_profiles
  add column if not exists preferred_theme text,
  add column if not exists default_term_id uuid references public.terms (id) on delete set null,
  add column if not exists schedule_view text;

alter table if exists public.user_profiles
  drop constraint if exists user_profiles_preferred_theme_check;

alter table if exists public.user_profiles
  add constraint user_profiles_preferred_theme_check
  check (preferred_theme in ('light', 'dark') or preferred_theme is null);

alter table if exists public.user_profiles
  drop constraint if exists user_profiles_schedule_view_check;

alter table if exists public.user_profiles
  add constraint user_profiles_schedule_view_check
  check (schedule_view in ('weekly', 'list') or schedule_view is null);
