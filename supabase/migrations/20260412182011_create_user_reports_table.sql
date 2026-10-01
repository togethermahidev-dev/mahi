create table public.user_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  reported_post_id uuid references public.posts(id) on delete cascade,
  reason           text not null check (reason in ('spam','harassment','inappropriate_content','impersonation','other')),
  description      text,
  created_at       timestamptz not null default now(),
  constraint user_reports_unique_user unique (reporter_id, reported_user_id),
  constraint user_reports_has_target check (reported_user_id is not null or reported_post_id is not null)
);

alter table public.user_reports enable row level security;

create policy "Users can insert own reports"
  on public.user_reports for insert with check (auth.uid() = reporter_id);
create policy "Users can read own reports"
  on public.user_reports for select using (auth.uid() = reporter_id);
