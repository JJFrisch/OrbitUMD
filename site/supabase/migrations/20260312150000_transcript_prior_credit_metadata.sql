alter table if exists public.user_prior_credits
  add column if not exists grade text;

alter table if exists public.user_prior_credits
  add column if not exists counts_toward_progress boolean not null default true;

alter table if exists public.user_prior_credits
  add column if not exists import_origin text not null default 'manual';

alter table if exists public.user_prior_credits
  drop constraint if exists user_prior_credits_source_type_check;

alter table if exists public.user_prior_credits
  add constraint user_prior_credits_source_type_check
  check (source_type in ('AP','IB','transfer','exemption','other','transcript'));

alter table if exists public.user_prior_credits
  drop constraint if exists user_prior_credits_import_origin_check;

alter table if exists public.user_prior_credits
  add constraint user_prior_credits_import_origin_check
  check (import_origin in ('manual','testudo_transcript'));
