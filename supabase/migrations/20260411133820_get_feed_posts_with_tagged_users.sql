drop function if exists public.get_feed_posts(integer, timestamp with time zone, uuid);

create function public.get_feed_posts(
  p_limit integer,
  p_cursor_ts timestamp with time zone default null,
  p_cursor_id uuid default null
)
returns table(
  id uuid,
  user_id uuid,
  image_url text,
  pov_image_url text,
  caption text,
  streak_day integer,
  created_at timestamp with time zone,
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean,
  tagged_users jsonb
)
language sql
stable
security definer
as $function$
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
    (select count(*) from public.post_likes    l where l.post_id = p.id),
    (select count(*) from public.post_comments c where c.post_id = p.id),
    exists(select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    (
      select jsonb_agg(
        jsonb_build_object(
          'user_id',      pt.user_id,
          'username',     tp.username,
          'display_name', tp.display_name,
          'avatar_url',   tp.avatar_url
        )
        order by tp.username
      )
      from public.post_tags pt
      join public.profiles  tp on tp.id = pt.user_id
      where pt.post_id = p.id
    )
  from public.posts    p
  join public.profiles pr on pr.id = p.user_id
  where (
    p_cursor_ts is null
    or p.created_at < p_cursor_ts
    or (p.created_at = p_cursor_ts and p.id < p_cursor_id)
  )
  order by p.created_at desc, p.id desc
  limit p_limit;
$function$;
