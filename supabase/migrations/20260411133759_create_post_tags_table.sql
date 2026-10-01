-- Junction table for user tags on posts.
create table public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

-- Index for "posts I was tagged in" lookups (future mentions inbox).
create index post_tags_user_id_idx on public.post_tags(user_id);

-- RLS: anyone who can see a post can see its tags; inserts require post ownership.
alter table public.post_tags enable row level security;

create policy post_tags_select on public.post_tags
  for select using (true);

create policy post_tags_insert on public.post_tags
  for insert with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
  );
