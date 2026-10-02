-- Push wording and feed-lock pushes (founder, 2026-10-02: "You've just been tagged by __. 47:59
-- hours left to post your Mahi!" — "notifs for the tag, you've been tagged, how long left on the
-- feed, all that stuff"). A push can't tick, so each one says the time left when it is sent.
--
-- What changes:
--   * the tag push:       "You've just been tagged by @sam. 48 hours left to post your Mahi!"
--   * the two reminders:  "24 hours left to post your Mahi! @sam is waiting." (and "2 hours …")
--   * the answered push:  "@sam answered your tag in 3h"
--   * two new feed pushes, each with its own switch in app_config:
--       feed_lock_warning  "Your feed locks in 1 hour. Post your answer to @sam to keep it open."
--       feed_locked        "Your feed is locked. Post your answer to @sam to open it."
-- Likes, comments, follows, joins, missed tags ("Your points are back to 0.") and messages keep
-- their words.
--
-- The feed pushes follow the lock rule in viewer_is_locked (20261001120000_reactive_posting):
-- a post opens the feed for app_config.unlock_window (24 hours); when that ends the feed locks
-- if a tag made since that post is still standing. So they are queued only for someone whose
-- feed is open on its 24 hours and who holds an open tag made since their last post: the warning
-- feed_lock_warning_lead (1 hour) before the 24 hours end, the locked push when they end. A tag
-- that arrives after the 24 hours locks the feed at once — its own tag push is the news, so no
-- second push. Posting, cancelling or missing the tag takes the queued pushes back.
-- Quiet hours: a warning that would have to wait is dropped ("in 1 hour" would no longer be
-- true); the locked push waits until they end, and is dropped if the tag has run out by then.
-- Blocked and banned people are left out by enqueue_push, as for every push.
-- Late is worse than never for a push that states a time: one that is more than
-- app_config.push_stale_after (1 hour) overdue when the sender gets to it — sending was paused,
-- or was not switched on yet — is closed as 'stale' instead of sent. So switching push on never
-- sends a backlog.
--
-- Reminders move out of create_post and claim_invite into one trigger on tag_challenges, so the
-- words live in one place. Safe for every app on phones: nothing the app reads changes.
-- Test: supabase/tests/tag_feed_pushes_test.sql (also tag_challenges_test, invites_test)
-- Undo: supabase/rollbacks/20261002190000_tag_and_feed_pushes.rollback.sql

-- 1. The owner's switches. Changing one is a one-line migration:
--      update public.app_config set feed_locked_push = false;
alter table public.app_config
  add column feed_lock_warning_push boolean not null default true,
  add column feed_lock_warning_lead interval not null default '1 hour'
    constraint app_config_feed_lock_warning_lead_positive check (feed_lock_warning_lead > interval '0'),
  add column feed_locked_push boolean not null default true,
  add column push_stale_after interval not null default '1 hour'
    constraint app_config_push_stale_after_positive check (push_stale_after > interval '0');

-- 2. "1 hour", "2 hours", "30 minutes", "1 hour 30 minutes" — for a sentence, unlike format_wait.
create function public.format_time_left(p interval)
returns text
language sql
immutable
as $$
  select concat_ws(' ',
    case when h > 0 then h || case when h = 1 then ' hour' else ' hours' end end,
    case when m > 0 or h = 0 then m || case when m = 1 then ' minute' else ' minutes' end end)
  from (select floor(extract(epoch from p) / 3600)::int as h,
               floor(extract(epoch from p) / 60)::int % 60 as m) t;
$$;

-- 3. Work out, from scratch, the feed pushes one person should have queued. Safe to call at any
--    time and any number of times: a push already sent for the same post is never queued again
--    (dedupe key), and anything queued that is no longer true is removed.
create function public.schedule_feed_lock_pushes(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.app_config;
  v_post public.posts;
  v_locks_at timestamptz;
  v_tag public.tag_challenges;
  v_tagger text;
  v_warn_at timestamptz;
begin
  delete from public.push_outbox
  where user_id = p_user and kind in ('feed_lock_warning', 'feed_locked') and sent_at is null;

  select * into v_cfg from public.app_config;
  if not v_cfg.feed_lock_enabled then
    return;
  end if;

  -- Never posted: the feed is locked already. The 24 hours are over: a tag locks it at once, and
  -- the tag push says so.
  select * into v_post from public.posts where user_id = p_user order by created_at desc limit 1;
  if not found then
    return;
  end if;
  v_locks_at := v_post.created_at + v_cfg.unlock_window;
  if v_locks_at <= now() then
    return;
  end if;

  -- The tag that locks the feed and that a post can still answer when it does. With several,
  -- the one whose deadline is nearest (the one the camera's banner names).
  select c.* into v_tag
  from public.tag_challenges c
  where c.tagged_id = p_user
    and c.created_at > v_post.created_at
    and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
    and c.expires_at > v_locks_at
  order by c.expires_at
  limit 1;
  if not found then
    return;
  end if;
  select '@' || username into v_tagger from public.profiles where id = v_tag.tagger_id;

  v_warn_at := v_locks_at - v_cfg.feed_lock_warning_lead;
  if v_cfg.feed_lock_warning_push and v_warn_at > now() then
    perform public.enqueue_push(
      p_user, v_tag.tagger_id, 'feed_lock_warning',
      'Your feed locks in ' || public.format_time_left(v_cfg.feed_lock_warning_lead)
        || '. Post your answer to ' || v_tagger || ' to keep it open.',
      jsonb_build_object('route', 'camera'),
      v_warn_at,
      'feed_lock_warning:' || v_post.id,
      v_tag.id,
      v_warn_at          -- held back by quiet hours it would no longer be true: dropped instead
    );
  end if;

  if v_cfg.feed_locked_push then
    perform public.enqueue_push(
      p_user, v_tag.tagger_id, 'feed_locked',
      'Your feed is locked. Post your answer to ' || v_tagger || ' to open it.',
      jsonb_build_object('route', 'camera'),
      v_locks_at,
      'feed_locked:' || v_post.id,
      v_tag.id,
      v_tag.expires_at   -- after quiet hours it is still true only while the tag can be answered
    );
  end if;
end;
$$;

-- 4. One place for what a tag queues. When someone is tagged (a new tag, or an invite's tag
--    getting its person): their two reminders. Whenever a tag changes state (made, answered,
--    cancelled, missed): that person's feed pushes are worked out again.
create function public.queue_tag_pushes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tagger text;
begin
  if new.tagged_id is null then
    return new;                       -- an invite nobody has claimed yet
  end if;

  if (tg_op = 'INSERT' or old.tagged_id is null)
     and new.expires_at is not null
     and new.answered_at is null and new.cancelled_at is null and new.missed_at is null then
    select username into v_tagger from public.profiles where id = new.tagger_id;
    perform public.enqueue_push(
      new.tagged_id, new.tagger_id, 'tag_reminder',
      r.hours_left || ' hours left to post your Mahi! @' || v_tagger || ' is waiting.',
      jsonb_build_object('route', 'camera'),
      new.expires_at - make_interval(hours => r.hours_left),
      'tag:' || new.id || ':' || r.hours_left || 'h',
      new.id,
      new.expires_at
    )
    from (values (24), (2)) r(hours_left)
    -- A reminder whose moment has already passed (a shorter tag window) is not sent.
    where new.expires_at - make_interval(hours => r.hours_left) > now();
  end if;

  perform public.schedule_feed_lock_pushes(new.tagged_id);
  return new;
end;
$$;

create trigger queue_tag_pushes
  after insert or update of tagged_id, answered_at, cancelled_at, missed_at on public.tag_challenges
  for each row execute function public.queue_tag_pushes();

-- 5. create_post no longer queues the reminders itself (20261002100000_video_posts' body, minus
--    that block; the trigger above does it).
create or replace function public.create_post(
  p_client_id uuid,
  p_image_path text,
  p_pov_image_path text default null,
  p_caption text default null,
  p_tagged_ids uuid[] default '{}',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_invite_count int default 0,
  p_rear_media_type text default 'photo',
  p_front_media_type text default 'photo'
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
  v_base text;
  v_has_coords boolean := p_latitude is not null and p_longitude is not null;
  v_rear_type text := coalesce(p_rear_media_type, 'photo');
  v_front_type text := coalesce(p_front_media_type, 'photo');
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;

  -- Every tag that ran out is marked missed now, not when the job runs: a tag of yours puts your
  -- streak back to 0 before this post counts, and your own expired tags no longer block
  -- re-tagging the same friend (their streaks reset too). It runs before this user's row is
  -- locked, so two people posting at once can never wait on each other.
  perform public.break_missed_streaks();

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

  -- Each shot is a photo or a video, and its file says the same: a video is a .mov or .mp4, a
  -- photo is not. A front video needs a front file.
  if v_rear_type not in ('photo', 'video')
     or v_front_type not in ('photo', 'video')
     or (v_front_type = 'video' and p_pov_image_path is null)
     or ((p_image_path ~* '\.(mov|mp4)$') <> (v_rear_type = 'video'))
     or (p_pov_image_path is not null
         and (p_pov_image_path ~* '\.(mov|mp4)$') <> (v_front_type = 'video'))
  then
    raise exception 'unsupported media' using errcode = '22023';
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
    rear_media_type, front_media_type,
    caption, streak_day, latitude, longitude
  )
  values (
    v_uid, p_client_id, v_base || p_image_path,
    case when p_pov_image_path is not null then v_base || p_pov_image_path end,
    p_image_path, p_pov_image_path,
    v_rear_type, v_front_type,
    nullif(btrim(p_caption), ''),
    v_profile.streak_current,
    case when v_has_coords then p_latitude end,
    case when v_has_coords then p_longitude end
  )
  returning * into v_post;
  -- (answer_tags_on_post has now answered this user's open tags)

  -- Each tag's reminders and feed-lock pushes are queued by the queue_tag_pushes trigger. In id
  -- order, so two posts tagging the same friends at once queue for them in the same order.
  insert into public.tag_challenges (post_id, tagger_id, tagged_id, expires_at)
  select v_post.id, v_uid, t, now() + v_cfg.tag_window from unnest(v_tags) t order by t;

  -- Tag bubbles; notify_on_tag turns each into a notification and its deadline push.
  insert into public.post_tags (post_id, user_id) select v_post.id, unnest(v_tags);

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

-- 6. claim_invite the same (20260917121508_invites' body, minus its reminder block).
create or replace function public.claim_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_inv public.invites;
  v_c public.tag_challenges;
  v_me public.profiles;
  v_inviter public.profiles;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  select * into v_me from public.profiles where id = v_uid;
  if not found or v_me.is_banned then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_inv from public.invites
  where token = p_token or lower(code) = lower(btrim(coalesce(p_token, '')))
  for update;
  if not found then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  -- The same person claiming again gets the same answer, not a second tag.
  if v_inv.claimed_by = v_uid then
    return public.invite_result(v_inv);
  end if;
  if v_inv.claimed_at is not null then
    raise exception 'that invite has been used' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'that invite has expired' using errcode = '22023';
  end if;
  if v_inv.inviter_id = v_uid then
    raise exception 'that invite is your own' using errcode = '22023';
  end if;
  -- An invite is for someone new; an older account can't farm tags with one.
  if v_me.created_at < now() - interval '24 hours' then
    raise exception 'invites are for new accounts' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = v_inv.inviter_id)
       or (b.blocker_id = v_inv.inviter_id and b.blocked_id = v_uid)
  ) then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  select * into v_inviter from public.profiles where id = v_inv.inviter_id and not is_banned;
  if not found then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  -- The row is locked, so two people racing the same link: one wins here, the other saw
  -- claimed_at above or waits and then sees it.
  update public.invites set claimed_by = v_uid, claimed_at = now()
  where token = v_inv.token
  returning * into v_inv;

  -- Friends both ways, so they can tag each other from here on.
  insert into public.follows (follower_id, following_id)
  values (v_uid, v_inv.inviter_id), (v_inv.inviter_id, v_uid)
  on conflict do nothing;

  -- The tag gets its person: queue_tag_pushes queues their reminders and feed-lock pushes.
  update public.tag_challenges
  set tagged_id = v_uid, expires_at = now() + v_cfg.tag_window
  where id = v_inv.challenge_id
    and tagged_id is null and cancelled_at is null and answered_at is null
  returning * into v_c;

  if found then
    -- The tag bubble on the post; notify_on_tag makes the notification and its push.
    insert into public.post_tags (post_id, user_id)
    select v_c.post_id, v_uid where v_c.post_id is not null
    on conflict do nothing;
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  values (v_inv.inviter_id, v_uid, 'invite_joined', v_c.post_id, v_c.id);

  return public.invite_result(v_inv);
end;
$$;

-- 7. The tag push and the answered push (20261002170000_mahi_points' body; only those two texts
--    change). The notifications list in the app uses the same words (src/lib/notificationText.ts).
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
             else 'You''ve just been tagged by ' || v_actor || '. ' || v_hours
                  || ' hours left to post your Mahi!' end
      when 'tag_answered' then
        v_actor || ' answered your tag in ' || public.format_wait(v_c.answered_at - v_c.created_at)
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

-- 8. Reminders already queued for open tags get the new words too. Nothing has been sent yet
--    when this is written (send-push is not deployed), and a sent row is never touched.
update public.push_outbox o
set body = substring(o.dedupe_key from ':(\d+)h$') || ' hours left to post your Mahi! @'
           || p.username || ' is waiting.'
from public.tag_challenges c
join public.profiles p on p.id = c.tagger_id
where o.kind = 'tag_reminder' and o.sent_at is null and o.challenge_id = c.id;

-- 9. People holding an open tag right now get their feed pushes queued, as if tagged after this.
select public.schedule_feed_lock_pushes(t.tagged_id)
from (
  select distinct c.tagged_id
  from public.tag_challenges c
  where c.tagged_id is not null
    and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
) t;

-- 10. The sender never hands out a push that is badly overdue (20260917111346_push's body, plus
--     the stale rule). It is closed like a sent one, with error 'stale', so it is not retried.
create or replace function public.claim_push_batch(p_limit int default 500)
returns table (id bigint, user_id uuid, kind text, body text, data jsonb, tokens text[])
language sql
security definer
set search_path = public
as $$
  with stale as (
    update public.push_outbox o
    set sent_at = now(), error = 'stale', receipts_checked_at = now()
    from public.app_config cfg
    where o.sent_at is null and o.send_after < now() - cfg.push_stale_after
  ),
  due as (
    select o.id
    from public.push_outbox o
    cross join public.app_config cfg
    where o.sent_at is null
      and o.send_after <= now()
      and o.send_after >= now() - cfg.push_stale_after
      and (o.claimed_at is null or o.claimed_at < now() - interval '5 minutes')
    order by o.send_after
    limit p_limit
    for update of o skip locked
  ),
  claimed as (
    update public.push_outbox o
    set claimed_at = now()
    from due
    where o.id = due.id
    returning o.id, o.user_id, o.kind, o.body, o.data
  )
  select c.id, c.user_id, c.kind, c.body, c.data,
         coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = c.user_id), '{}')
  from claimed c;
$$;

-- 11. Internals only: nothing here is for the app to call.
revoke execute on function
  public.format_time_left(interval),
  public.schedule_feed_lock_pushes(uuid),
  public.queue_tag_pushes()
from public, anon, authenticated;

notify pgrst, 'reload schema';
