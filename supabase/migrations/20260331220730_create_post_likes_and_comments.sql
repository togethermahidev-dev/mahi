
-- post_likes
create table public.post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_unique unique (post_id, user_id)
);
alter table public.post_likes enable row level security;
create policy "likes_select" on public.post_likes for select to authenticated using (true);
create policy "likes_insert" on public.post_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "likes_delete" on public.post_likes for delete to authenticated using (auth.uid() = user_id);

-- post_comments
create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);
alter table public.post_comments enable row level security;
create policy "comments_select" on public.post_comments for select to authenticated using (true);
create policy "comments_insert" on public.post_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "comments_delete" on public.post_comments for delete to authenticated using (auth.uid() = user_id);
