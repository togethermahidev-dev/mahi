-- Undo 20261008160000_drop_dead_functions: recreate get_feed_posts (as 20261006100000_moderation,
-- with the search path from 20261007150000, revoked from everyone as 20261008100000) and
-- format_wait (as 20260917112413_tag_challenges, same search path, revoked from everyone).
begin;

create function public.get_feed_posts(
  p_limit integer,
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null
)
returns table(id uuid, user_id uuid, image_url text, pov_image_url text, caption text,
              streak_day integer, created_at timestamptz, profile_id uuid, username text,
              display_name text, avatar_url text, like_count bigint, comment_count bigint,
              liked_by_me boolean, tagged_users jsonb)
language sql
stable
security definer
as $$
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
    (select count(*) from public.post_comments c where c.post_id = p.id and c.removed_at is null),
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
  and p.hidden_at is null
  and p.user_id not in (
    select blocked_id from public.user_blocks where blocker_id = auth.uid()
    union
    select blocker_id from public.user_blocks where blocked_id = auth.uid()
  )
  and pr.is_banned = false
  order by p.created_at desc, p.id desc
  limit p_limit;
$$;

alter function public.get_feed_posts(integer, timestamptz, uuid) set search_path = public;
revoke execute on function public.get_feed_posts(integer, timestamptz, uuid) from public, anon, authenticated;

-- "3h", "45m", "1d 2h"
create function public.format_wait(p interval)
returns text
language sql
immutable
as $$
  select case
    when p < interval '1 hour' then greatest(floor(extract(epoch from p) / 60), 1)::int || 'm'
    when p < interval '1 day' then floor(extract(epoch from p) / 3600)::int || 'h'
    else floor(extract(epoch from p) / 86400)::int || 'd '
         || (floor(extract(epoch from p) / 3600)::int % 24) || 'h'
  end;
$$;

alter function public.format_wait(interval) set search_path = public;
revoke execute on function public.format_wait(interval) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
