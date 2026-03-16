create table if not exists public.user_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('feature', 'bug', 'other')),
  title text not null,
  details text not null,
  contact text,
  page_path text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_feedback_submissions_user_created
  on public.user_feedback_submissions(user_id, created_at desc);

alter table public.user_feedback_submissions enable row level security;

drop policy if exists "feedback own rows" on public.user_feedback_submissions;
create policy "feedback own rows"
  on public.user_feedback_submissions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);