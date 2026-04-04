alter table if exists public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists idx_notifications_user_dedupe_unique
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;