-- Update user_profiles to store specializations generically for any program
-- Using JSONB to store {program_id -> specialization_id} mapping

-- Replace the old cs-specific column with a generic structure
alter table if exists public.user_profiles
  drop column if exists cs_specialization_id cascade;

alter table if exists public.user_profiles
  add column if not exists program_specializations jsonb default '{}'::jsonb;

-- Add index for faster lookups
create index if not exists idx_user_profiles_program_specs
  on public.user_profiles using gin (program_specializations);

-- Add comment for clarity
comment on column public.user_profiles.program_specializations is 'JSONB object mapping program_id -> specialization_id for selected specializations across all programs';
