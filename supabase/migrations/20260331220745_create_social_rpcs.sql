
-- toggle_like: atomic insert-or-delete, returns final state in one round trip
create or replace function toggle_like(p_post_id uuid, p_user_id uuid)
returns table (liked boolean, like_count bigint)
language plpgsql security definer as $$
declare
  _liked boolean;
  _rows  int;
begin
  insert into public.post_likes (post_id, user_id) values (p_post_id, p_user_id)
  on conflict (post_id, user_id) do nothing;
  get diagnostics _rows = row_count;
  if _rows > 0 then
    _liked := true;
  else
    delete from public.post_likes where post_id = p_post_id and user_id = p_user_id;
    _liked := false;
  end if;
  return query select _liked, count(*) from public.post_likes where post_id = p_post_id;
end;
$$;

-- get_feed_posts: enriched feed with counts + liked_by_me for the calling user
create or replace function get_feed_posts(
  p_limit     int,
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid        default null
)
returns table (
  id            uuid,
  user_id       uuid,
  image_url     text,
  pov_image_url text,
  caption       text,
  streak_day    int,
  created_at    timestamptz,
  profile_id    uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  like_count    bigint,
  comment_count bigint,
  liked_by_me   boolean
)
language sql security definer stable as $$
  select
    p.id,
    p.user_id,
    p.image_url,
    p.pov_image_url,
    p.caption,
    p.streak_day,
    p.created_at,
    pr.id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    (select count(*) from public.post_likes   l where l.post_id = p.id),
    (select count(*) from public.post_comments c where c.post_id = p.id),
    exists(select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid())
  from public.posts    p
  join public.profiles pr on pr.id = p.user_id
  where (
    p_cursor_ts is null
    or p.created_at < p_cursor_ts
    or (p.created_at = p_cursor_ts and p.id < p_cursor_id)
  )
  order by p.created_at desc, p.id desc
  limit p_limit;
$$;
