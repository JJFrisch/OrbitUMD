-- Add a JSONB column for student recommendation preferences (interests, workload, etc.)
alter table if exists public.user_profiles
  add column if not exists recommendation_preferences jsonb;
