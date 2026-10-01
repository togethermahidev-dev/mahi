-- Undo supabase/deferred/drop_rest_days.sql: brings back the columns and the streak_logs table empty.
-- The data in them is gone unless restored from a backup taken before the push
-- (scripts/db.sh backup). Run this before 20261001120000_reactive_posting's rollback, whose
-- create_post reads streak_lowest.
begin;

alter table public.profiles
  add column fitness_routine text,
  add column streak_lowest integer,                 -- lowest completed non-zero streak
  add column streak_last_upload_date date;

create table public.streak_logs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  streak_count integer     not null default 1,
  started_at   date        not null,
  ended_at     date,                                 -- null = still active
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now()
);
create index streak_logs_user_id_idx on public.streak_logs (user_id);
create index streak_logs_active_idx on public.streak_logs (user_id, is_active) where is_active = true;

alter table public.streak_logs enable row level security;
create policy "Users can view own streak logs"
  on public.streak_logs for select
  using (auth.uid() = user_id);
create policy "streak_logs_insert_own"
  on public.streak_logs for insert to authenticated
  with check (auth.uid() = user_id);
create policy "streak_logs_update_own"
  on public.streak_logs for update to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
commit;
