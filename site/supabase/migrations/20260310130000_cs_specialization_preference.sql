-- Add CS specialization preference to user profiles
alter table if exists public.user_profiles
  add column if not exists cs_specialization_id text;

-- Add constraint to valid specialization IDs
alter table if exists public.user_profiles
  drop constraint if exists user_profiles_cs_specialization_check;

alter table if exists public.user_profiles
  add constraint user_profiles_cs_specialization_check
  check (cs_specialization_id in (
    'cybersecurity-specialization',
    'data-science-specialization',
    'machine-learning-specialization',
    'quantum-information-specialization'
  ) or cs_specialization_id is null);
