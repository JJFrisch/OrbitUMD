create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  notify_registration_window boolean not null default true,
  notify_seat_availability boolean not null default true,
  notify_waitlist_movement boolean not null default true,
  notify_graduation_gaps boolean not null default true,
  notify_drop_deadlines boolean not null default true,
  notify_feature_announcements boolean not null default false,
  delivery_email boolean not null default true,
  delivery_push boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists idx_notification_preferences_user
  on public.notification_preferences(user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'registration_window',
    'seat_availability',
    'waitlist_movement',
    'graduation_gaps',
    'drop_deadlines',
    'feature_announcements'
  )),
  title text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  delivery_method text not null check (delivery_method in ('email', 'push', 'in_app')),
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_deliveries_notification
  on public.notification_deliveries(notification_id, created_at desc);

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  push_token text not null,
  platform text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, push_token)
);

create index if not exists idx_user_push_tokens_user
  on public.user_push_tokens(user_id, last_seen_at desc);

alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.user_push_tokens enable row level security;

drop policy if exists "notification preferences own rows" on public.notification_preferences;
create policy "notification preferences own rows"
  on public.notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notifications own rows" on public.notifications;
create policy "notifications own rows"
  on public.notifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notification deliveries own rows" on public.notification_deliveries;
create policy "notification deliveries own rows"
  on public.notification_deliveries for all
  using (
    exists (
      select 1
      from public.notifications n
      where n.id = notification_deliveries.notification_id
        and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.notifications n
      where n.id = notification_deliveries.notification_id
        and n.user_id = auth.uid()
    )
  );

drop policy if exists "push tokens own rows" on public.user_push_tokens;
create policy "push tokens own rows"
  on public.user_push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);