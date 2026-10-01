create table public.user_blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint user_blocks_unique unique (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id != blocked_id)
);

create index idx_user_blocks_blocker on public.user_blocks(blocker_id);
create index idx_user_blocks_blocked on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

create policy "Users can read own blocks"
  on public.user_blocks for select using (auth.uid() = blocker_id);
create policy "Users can insert own blocks"
  on public.user_blocks for insert with check (auth.uid() = blocker_id);
create policy "Users can delete own blocks"
  on public.user_blocks for delete using (auth.uid() = blocker_id);
