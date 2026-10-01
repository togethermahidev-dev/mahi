-- Reactive posting and tag streaks (founder, 2026-10-01).
-- Reactive posting: you post when someone has tagged you and you can still answer it. Your very
-- first post is free. Posting once a day is no longer the rule: answer a tag, post again.
-- The streak: each post that answers at least one tag adds 1 (however many it answers). A tag that
-- runs out unanswered (48 hours + grace, not cancelled) puts the streak back to 0; the highest
-- streak is never lowered. Everyone starts again from 0 today.
-- The feed lock keeps its rule, but a cancelled tag no longer locks it.
-- The old daily streak (record_upload_streak, rest days, streak_logs) stops being used here; its
-- columns and table go in 20261001120100_drop_rest_days once every phone has the new app.
-- Tests: supabase/tests/reactive_posting_test.sql, feed_lock_test.sql, tag_challenges_test.sql,
-- timezone_postdate_test.sql

-- 1. Everyone starts again from 0. missed_at stays the one record of a missed tag: a tag resets
--    its person's streak at the moment it is marked missed, so it can only ever do that once, and
--    tags that ran out before today already carry missed_at from the 5-minute job, so they never
--    count against the new streaks.
update public.profiles set streak_current = 0 where streak_current <> 0;

-- 2. Reactive posting: may this person post now? Never posted, or an open tag they can still answer.
create function public.reactive_posting_open(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.posts where user_id = p_user)
      or exists (
           select 1 from public.tag_challenges c
           cross join public.app_config cfg
           where c.tagged_id = p_user
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
             and c.expires_at >= now() - cfg.answer_grace
         );
$$;

-- 3. Missed tags reset the streak: every run-out, unanswered, uncancelled tag not yet marked
--    missed (only p_user's when given) is marked now and puts its person's streak back to 0.
--    Marking it also frees the tagger → friend pair for a new tag.
create function public.break_missed_streaks(p_user uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  with missed as (
    update public.tag_challenges c
    set missed_at = now()
    from public.app_config cfg
    where c.tagged_id is not null
      and (p_user is null or c.tagged_id = p_user)
      and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
      and c.expires_at < now() - cfg.answer_grace
    returning c.tagged_id
  )
  update public.profiles p
  set streak_current = 0
  where p.id in (select tagged_id from missed) and p.streak_current <> 0;
$$;

-- 4. The person who missed hears they lost their streak; the tagger still hears it was missed.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag', 'tag_answered', 'tag_missed', 'invite_joined',
                  'streak_lost'));

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
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your streak is back to 0.'
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


create or replace function public.mark_missed_tags()
returns void
language sql
security definer
set search_path = public
as $$
  select public.break_missed_streaks();

  with due as (
    select c.id
    from public.tag_challenges c
    cross join public.app_config cfg
    where c.answered_at is null and c.cancelled_at is null and c.missed_notified_at is null
      and c.expires_at < now() - cfg.answer_grace
    for update of c skip locked
  ),
  marked as (
    update public.tag_challenges c
    set missed_at = coalesce(c.missed_at, now()), missed_notified_at = now()
    from due
    where c.id = due.id
    returning c.id, c.post_id, c.tagger_id, c.tagged_id
  )
  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  select tagger_id, tagged_id, 'tag_missed', post_id, id from marked
  union all
  select tagged_id, tagger_id, 'streak_lost', post_id, id from marked;
$$;

-- 5. Posting: reactive posting replaces "once a day", and the streak counts answered tags.
create or replace function public.create_post(
  p_client_id uuid,
  p_image_path text,
  p_pov_image_path text default null,
  p_caption text default null,
  p_tagged_ids uuid[] default '{}',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_invite_count int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_profile public.profiles;
  v_post public.posts;
  v_tags uuid[] := array(select distinct t from unnest(coalesce(p_tagged_ids, '{}')) t);
  v_invites int := greatest(coalesce(p_invite_count, 0), 0);
  v_available int;
  v_required int;
  v_new_ids uuid[];
  v_base text;
  v_has_coords boolean := p_latitude is not null and p_longitude is not null;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;

  -- Serialise everything this user does from here on (double taps, two devices).
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.is_banned then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Idempotent retry: same client id → the post that was already made, same invite links.
  select * into v_post from public.posts where client_id = p_client_id and user_id = v_uid;
  if found then
    return jsonb_build_object(
      'post', to_jsonb(v_post),
      'streak', jsonb_build_object(
        'streak_current', v_profile.streak_current,
        'streak_highest', v_profile.streak_highest),
      'answered', public.answered_by_post(v_post.id),
      'invites', public.post_invites(v_post.id),
      'replayed', true
    );
  end if;

  -- Every tag that ran out is marked missed now, not when the job runs: a tag of yours puts your
  -- streak back to 0 before this post counts, and your own expired tags no longer block
  -- re-tagging the same friend (their streaks reset too).
  perform public.break_missed_streaks();
  select * into v_profile from public.profiles where id = v_uid;

  -- Reactive posting: you post when someone has tagged you (your first post is free).
  if not public.reactive_posting_open(v_uid) then
    raise exception 'reactive posting: not tagged' using errcode = 'P0001';
  end if;

  if p_image_path is null
     or split_part(p_image_path, '/', 1) <> v_uid::text
     or not exists (select 1 from storage.objects where bucket_id = 'posts' and name = p_image_path)
     or (p_pov_image_path is not null and (
           split_part(p_pov_image_path, '/', 1) <> v_uid::text
           or not exists (select 1 from storage.objects where bucket_id = 'posts' and name = p_pov_image_path)))
  then
    raise exception 'photo not found' using errcode = '22023';
  end if;

  select count(*) into v_available from public.taggable_friends(v_uid) where not has_open_tag;
  -- Once invite links are switched on, an empty slot can always be filled by an invite, so every
  -- post carries the full three. Until then, having too few friends still excuses the difference.
  v_required := case
    when not v_cfg.tags_required then 0
    when v_cfg.invite_links_enabled then v_cfg.tag_count
    else least(v_cfg.tag_count, v_available)
  end;
  if cardinality(v_tags) + v_invites < v_required
     or cardinality(v_tags) + v_invites > greatest(v_cfg.tag_count, 1) then
    raise exception 'tag or invite % people', v_required
      using errcode = '22023', detail = json_build_object('required', v_required)::text;
  end if;
  if exists (
    select 1 from unnest(v_tags) t(id)
    where t.id not in (select f.id from public.taggable_friends(v_uid) f where not f.has_open_tag)
  ) then
    raise exception 'cannot tag that person' using errcode = '22023';
  end if;

  -- The streak: +1 for a post that answers at least one tag, however many it answers.
  if exists (
    select 1 from public.tag_challenges c
    where c.tagged_id = v_uid
      and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
      and c.expires_at >= now() - v_cfg.answer_grace
  ) then
    update public.profiles
    set streak_current = streak_current + 1,
        streak_highest = greatest(streak_highest, streak_current + 1)
    where id = v_uid
    returning * into v_profile;
  end if;

  v_base := v_cfg.storage_public_url || '/posts/';
  insert into public.posts (
    user_id, client_id, image_url, pov_image_url, image_path, pov_image_path,
    caption, streak_day, latitude, longitude
  )
  values (
    v_uid, p_client_id, v_base || p_image_path,
    case when p_pov_image_path is not null then v_base || p_pov_image_path end,
    p_image_path, p_pov_image_path,
    nullif(btrim(p_caption), ''),
    v_profile.streak_current,
    case when v_has_coords then p_latitude end,
    case when v_has_coords then p_longitude end
  )
  returning * into v_post;
  -- (answer_tags_on_post has now answered this user's open tags)

  with created as (
    insert into public.tag_challenges (post_id, tagger_id, tagged_id, expires_at)
    select v_post.id, v_uid, t, now() + v_cfg.tag_window from unnest(v_tags) t
    returning id
  )
  select array_agg(id) into v_new_ids from created;

  -- Tag bubbles; notify_on_tag turns each into a notification and its deadline push.
  insert into public.post_tags (post_id, user_id) select v_post.id, unnest(v_tags);

  perform public.enqueue_push(
    c.tagged_id, v_uid, 'tag_reminder', r.hours_left || ' hours left to answer @' || v_profile.username,
    jsonb_build_object('route', 'camera'),
    c.expires_at - make_interval(hours => r.hours_left),
    'tag:' || c.id || ':' || r.hours_left || 'h',
    c.id,
    c.expires_at
  )
  from public.tag_challenges c
  cross join (values (24), (2)) r(hours_left)
  where c.id = any(v_new_ids);

  -- Slots filled by an invite: a challenge with nobody in it yet, and a link each.
  if v_invites > 0 then
    with made as (
      insert into public.tag_challenges (post_id, tagger_id)
      select v_post.id, v_uid from generate_series(1, v_invites)
      returning id
    )
    insert into public.invites (token, code, inviter_id, challenge_id, expires_at)
    select encode(extensions.gen_random_bytes(16), 'hex'), public.new_invite_code(), v_uid, made.id,
           now() + v_cfg.invite_ttl
    from made;
  end if;

  return jsonb_build_object(
    'post', to_jsonb(v_post),
    'streak', jsonb_build_object(
      'streak_current', v_profile.streak_current,
      'streak_highest', v_profile.streak_highest),
    'answered', public.answered_by_post(v_post.id),
    'invites', public.post_invites(v_post.id),
    'replayed', false
  );
end;
$$;

-- More than one post a day is fine now. post_date stays: stats, points and the feed use it.
drop index public.posts_user_post_date_unique;

-- The daily streak function goes (every version of it); create_post was its only caller.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'record_upload_streak'
  loop
    execute 'drop function ' || f;
  end loop;
end $$;

-- 6. Feed lock: same rule, but a cancelled tag no longer locks. A missed one still does.
create or replace function public.viewer_is_locked(p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select cfg.feed_lock_enabled and (
    last.at is null
    or (last.at + cfg.unlock_window <= now()
        and exists (
          select 1 from public.tag_challenges c
          where c.tagged_id = p_viewer and c.created_at > last.at and c.cancelled_at is null
        ))
  )
  from public.app_config cfg
  cross join (select max(created_at) as at from public.posts where user_id = p_viewer) last;
$$;

-- 7. Internals only. create_post keeps its grants (replaced, not recreated).
revoke execute on function
  public.reactive_posting_open(uuid),
  public.break_missed_streaks(uuid)
from public, anon, authenticated;

notify pgrst, 'reload schema';
