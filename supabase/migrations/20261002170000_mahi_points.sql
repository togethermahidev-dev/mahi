-- Mahi points (founder, 2026-10-02): "You post. Tag 3 people. They have a 48 hour deadline to post
-- as well. If they meet the deadline = 1 Mahi point. This builds up over time. If you get tagged
-- and don't meet the 48hr deadline, you lose your points and start again. It would then say e.g.
-- Best = 48 points. This is not streaks. Streaks are a daily thing."
--
-- Mahi points are the counter 20261001120000_reactive_posting built: +1 for each post that answers
-- at least one open tag, back to 0 when a tag's 48 hours (+ grace) run out, the best never lowered.
-- It stays in profiles.streak_current / streak_highest and posts.streak_day, and create_post keeps
-- returning it as `streak` — apps already on phones read those names.
--
-- This retires the OLD points (20260917115316_points): no point for the tagger, no 3-a-day cap,
-- no never-resetting total. Its ledger (empty on prod, checked 2026-10-02), award function, cap
-- and stats view go. Everything that exposed the old total under the name `points` (the profile's
-- computed column, feed items, the tag list) now carries the Mahi points instead, so every app
-- version shows one number.
-- The missed-tag push says "points" instead of "streak".
-- Later, once every phone has the app that no longer reads profiles.points:
-- supabase/deferred/contract_points.sql drops that computed column.
-- Test: supabase/tests/mahi_points_test.sql (also reactive_posting_test, feed_lock_test,
-- tag_challenges_test, stats_test)
-- Undo: supabase/rollbacks/20261002170000_mahi_points.rollback.sql

-- 1. Answering a tag pays nobody extra: the answerer's +1 is create_post's, the tagger gets nothing.
--    (20260917112413_tag_challenges' body, as it was before the old points.)
create or replace function public.answer_tags_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  with answered as (
    update public.tag_challenges c
    set answered_post_id = new.id, answered_at = now()
    from public.app_config cfg
    where c.tagged_id = new.user_id
      and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
      and now() <= c.expires_at + cfg.answer_grace
    returning c.id
  )
  select array_agg(id) into v_ids from answered;

  if v_ids is null then
    return new;
  end if;

  delete from public.push_outbox where challenge_id = any(v_ids) and sent_at is null;
  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  select c.tagger_id, c.tagged_id, 'tag_answered', new.id, c.id
  from public.tag_challenges c where c.id = any(v_ids);
  return new;
end;
$$;

-- 2. `points` everywhere is the Mahi points. The profile's computed column stays for the apps on
--    phones (select('*, points')); the app from this release reads streak_current itself.
create or replace function public.points(p public.profiles)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select p.streak_current;
$$;

-- Feed items (20261002100000_video_posts' body; only 'points' changes).
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
    'comment_count', (select count(*) from public.post_comments c where c.post_id = p.id),
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

-- The tag list (20260928120000_tag_lock_rules' body; only the points column changes).
create or replace function public.get_taggable_friends(p_query text default '', p_limit int default 50)
returns table (
  id uuid, username text, display_name text, avatar_url text, has_open_tag boolean, points int,
  last_tagged_at timestamptz, tagged_you boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, t.has_open_tag, p.streak_current,
         (select max(c.created_at) from public.tag_challenges c where c.tagged_id = t.id),
         exists (
           select 1 from public.tag_challenges c
           cross join public.app_config cfg
           where c.tagger_id = t.id and c.tagged_id = auth.uid()
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
             and now() <= c.expires_at + cfg.answer_grace
         )
  from public.taggable_friends(auth.uid()) t
  join public.profiles p on p.id = t.id
  where coalesce(p_query, '') = ''
     or strpos(lower(p.username), lower(p_query)) > 0
     or strpos(lower(coalesce(p.display_name, '')), lower(p_query)) > 0
  order by t.has_open_tag, 7 asc nulls first, p.username
  limit least(greatest(p_limit, 1), 100);
$$;

-- 3. The missed-tag push (20261001120000_reactive_posting's body; only the streak_lost text changes).
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_c public.tag_challenges;
  v_hours int;
begin
  select '@' || username into v_actor from public.profiles where id = new.actor_id;

  if new.challenge_id is not null then
    select * into v_c from public.tag_challenges where id = new.challenge_id;
  elsif new.type = 'tag' then
    select * into v_c from public.tag_challenges
    where post_id = new.post_id and tagged_id = new.user_id;
  end if;
  select floor(extract(epoch from tag_window) / 3600)::int into v_hours from public.app_config;

  perform public.enqueue_push(
    new.user_id,
    new.actor_id,
    new.type,
    case new.type
      when 'like' then v_actor || ' liked your post'
      when 'comment' then v_actor || ' commented on your post'
      when 'follow' then v_actor || ' started following you'
      when 'tag' then
        case when v_c.id is null then v_actor || ' tagged you in a post'
             else v_actor || ' tagged you. You have ' || v_hours || ' hours to post.' end
      when 'tag_answered' then
        v_actor || ' posted ' || public.format_wait(v_c.answered_at - v_c.created_at) || ' after your tag'
      when 'tag_missed' then v_actor || ' missed your tag'
      when 'invite_joined' then v_actor || ' joined Mahi from your invite'
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your points are back to 0.'
      else v_actor
    end,
    jsonb_build_object(
      'route', case
        when new.type = 'follow' then 'profile'
        when new.type = 'tag' and v_c.id is not null then 'camera'
        when new.type = 'invite_joined' then 'profile'
        else 'post'
      end,
      'post_id', new.post_id,
      'user_id', new.actor_id,
      'notification_id', new.id
    ),
    now(),
    'notification:' || new.id,
    v_c.id
  );
  return new;
end;
$$;

-- 4. The old points system goes: its stats view, award function, ledger and daily cap.
drop view stats.points_daily;
drop function public.award_point(uuid, uuid, text);
drop table public.point_events;
alter table public.app_config drop column daily_point_cap;

notify pgrst, 'reload schema';
