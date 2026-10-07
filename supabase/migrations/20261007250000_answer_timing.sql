-- On-time markers (owner, 2026-10-07): a post that answered a tag says "Answered @sam in 2h" or
-- "…with 20 min to spare", and a first ever post says "First Mahi". Every feed and profile post
-- (get_feed and get_user_posts both build them with feed_item) gains two fields:
--   answered   {tagger_username, seconds_taken, seconds_to_spare} for the oldest tag the post
--              answered, else null;
--   first_post true when no earlier post by the same person exists.
-- Everything else in feed_item is unchanged from production (20261006100000_moderation's body,
-- checked against prod 2026-10-07). Rollback: supabase/rollbacks/20261007250000_answer_timing.rollback.sql

create or replace function public.feed_item(p public.posts, p_viewer uuid, p_hide boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'created_at', p.created_at,
    'post_date', p.post_date,
    'streak_day', p.streak_day,
    'locked', p_hide,
    'image_path', case when p_hide then null else p.image_path end,
    'pov_image_path', case when p_hide then null else p.pov_image_path end,
    'rear_media_type', case when p_hide then null else p.rear_media_type end,
    'front_media_type', case when p_hide then null else p.front_media_type end,
    'caption', case when p_hide then null else p.caption end,
    'latitude', case when p_hide then null else p.latitude end,
    'longitude', case when p_hide then null else p.longitude end,
    'like_count', (select count(*) from public.post_likes l where l.post_id = p.id),
    'comment_count', (select count(*) from public.post_comments c
                      where c.post_id = p.id and c.removed_at is null),
    'liked_by_me', exists (
      select 1 from public.post_likes l where l.post_id = p.id and l.user_id = p_viewer
    ),
    'tagged_users', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', tp.id, 'username', tp.username,
               'display_name', tp.display_name, 'avatar_url', tp.avatar_url
             ) order by tp.username)
      from public.post_tags pt
      join public.profiles tp on tp.id = pt.user_id
      where pt.post_id = p.id
    ), '[]'::jsonb),
    'response', (
      select jsonb_build_object(
               'tagger_username', t.username,
               'seconds', extract(epoch from c.answered_at - c.created_at)::int)
      from public.tag_challenges c
      join public.profiles t on t.id = c.tagger_id
      where c.answered_post_id = p.id
      order by c.created_at
      limit 1
    ),
    'answered', (
      select jsonb_build_object(
               'tagger_username', t.username,
               'seconds_taken',
                 greatest(0, extract(epoch from coalesce(c.answered_at, p.created_at) - c.created_at))::int,
               'seconds_to_spare',
                 greatest(0, extract(epoch from c.expires_at - coalesce(c.answered_at, p.created_at)))::int)
      from public.tag_challenges c
      join public.profiles t on t.id = c.tagger_id
      where c.answered_post_id = p.id
      order by c.created_at
      limit 1
    ),
    'first_post', not exists (
      select 1 from public.posts e
      where e.user_id = p.user_id
        and (e.created_at, e.id) < (p.created_at, p.id)
    ),
    'profile', (
      select jsonb_build_object(
               'id', pr.id, 'username', pr.username,
               'display_name', pr.display_name, 'avatar_url', pr.avatar_url,
               'points', pr.streak_current)
      from public.profiles pr
      where pr.id = p.user_id
    )
  );
$$;
