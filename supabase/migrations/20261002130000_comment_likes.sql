-- Comment likes (app flag `comment-likes`): a heart and a count on each comment, and a list of
-- who liked it. Built like post likes (post_likes, toggle_like): one row per person per comment,
-- you like and unlike only as yourself, signed-in people only. Someone blocked either way cannot
-- like the other's comment, and the list of who liked a comment leaves out anyone blocked either
-- way with the viewer, and banned profiles. Counts include every like, as post like counts do.
-- Additive: the app reads comments as before; these are extra calls made only with the flag on.
-- Test: supabase/tests/comment_likes_test.sql · Undo: supabase/rollbacks/20261002130000_comment_likes.rollback.sql

create table public.comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint comment_likes_unique unique (comment_id, user_id)
);
create index comment_likes_user_idx on public.comment_likes (user_id);

-- May the caller like this comment? It exists, and neither of you has blocked the other.
create function public.comment_like_allowed(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.post_comments c
    where c.id = p_comment_id
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = c.user_id)
           or (b.blocker_id = c.user_id and b.blocked_id = auth.uid())
      )
  );
$$;

alter table public.comment_likes enable row level security;
-- Anyone who can see the comment can see its likes.
create policy comment_likes_select on public.comment_likes
  for select to authenticated
  using (exists (select 1 from public.post_comments c where c.id = comment_id));
create policy comment_likes_insert on public.comment_likes
  for insert to authenticated
  with check (auth.uid() = user_id and public.comment_like_allowed(comment_id));
create policy comment_likes_delete on public.comment_likes
  for delete to authenticated
  using (auth.uid() = user_id);

-- Like, or take the like back. Returns where it ended up and the comment's like count.
create function public.toggle_comment_like(p_comment_id uuid)
returns table (liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from public.comment_likes where comment_id = p_comment_id and user_id = v_uid;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    liked := false;
  else
    if not public.comment_like_allowed(p_comment_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    insert into public.comment_likes (comment_id, user_id) values (p_comment_id, v_uid)
    on conflict (comment_id, user_id) do nothing;
    liked := true;
  end if;
  select count(*) into like_count from public.comment_likes l where l.comment_id = p_comment_id;
  return next;
end;
$$;

-- Every comment on a post with its like count and whether the caller liked it.
create function public.get_comment_likes(p_post_id uuid)
returns table (comment_id uuid, like_count bigint, liked_by_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         (select count(*) from public.comment_likes l where l.comment_id = c.id),
         exists (
           select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()
         )
  from public.post_comments c
  where c.post_id = p_post_id
    and auth.uid() is not null;
$$;

-- Who liked a comment, newest first: name and picture, without anyone blocked either way with
-- the caller, or banned. The list is read fresh each time it opens (the app keeps no copy).
create function public.get_comment_likers(p_comment_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  liked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, l.created_at
  from public.comment_likes l
  join public.profiles p on p.id = l.user_id and not p.is_banned
  where l.comment_id = p_comment_id
    and auth.uid() is not null
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = l.user_id)
         or (b.blocker_id = l.user_id and b.blocked_id = auth.uid())
    )
  order by l.created_at desc, p.username
  limit 500;
$$;

revoke execute on function
  public.comment_like_allowed(uuid),
  public.toggle_comment_like(uuid),
  public.get_comment_likes(uuid),
  public.get_comment_likers(uuid)
from public, anon;
grant execute on function
  public.comment_like_allowed(uuid),
  public.toggle_comment_like(uuid),
  public.get_comment_likes(uuid),
  public.get_comment_likers(uuid)
to authenticated;
