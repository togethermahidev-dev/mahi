CREATE OR REPLACE FUNCTION public.get_feed_posts(p_limit integer, p_cursor_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, user_id uuid, image_url text, pov_image_url text, caption text, streak_day integer, created_at timestamp with time zone, profile_id uuid, username text, display_name text, avatar_url text, like_count bigint, comment_count bigint, liked_by_me boolean, tagged_users jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
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
    coalesce(
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
      ),
      '[]'::jsonb
    )
  from public.posts    p
  join public.profiles pr on pr.id = p.user_id
  where (
    p_cursor_ts is null
    or p.created_at < p_cursor_ts
    or (p.created_at = p_cursor_ts and p.id < p_cursor_id)
  )
  and p.user_id not in (
    select blocked_id from public.user_blocks where blocker_id = auth.uid()
    union
    select blocker_id from public.user_blocks where blocked_id = auth.uid()
  )
  and pr.is_banned = false
  order by p.created_at desc, p.id desc
  limit p_limit;
$function$;
