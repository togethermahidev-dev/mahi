-- Tag slots (owner, 2026-10-03): every slot of a post is filled on the tag screen, before posting.
--   * A link is made the moment you tap invite, so the phone's share sheet opens straight away.
--   * Someone on Mahi who isn't your friend gets an in-app invite. Accepting makes you friends
--     and lands the tag; "Not now" frees the slot.
--   * Friends first: an invite (link or in-app) can only fill a slot when every friend you could
--     tag is already tagged.
--   * Each slot says where it's at (get_tag_slots), and the app hears changes live (realtime on
--     tag_challenges, which RLS keeps to your own rows).
--   * A link shared before posting still works if no post follows: the friend joins and you
--     become friends, without a tag. Posting drops any slot you didn't post with.
--
-- A slot is a tag_challenges row made before its post (post_id null). Until its 48 hours start it
-- has no expires_at, and every rule that reads tags compares expires_at with now(), so a waiting
-- slot is never answered, missed or anyone's open tag. The hours start (start_tag) once the slot
-- has both a post and a person who said yes: on posting for a friend who already joined or
-- accepted, on joining or accepting for a slot already on a post.
--
-- started_at is when the 48 hours started. The feed lock and its pushes compare it with your last
-- post, so a tag that starts after you posted locks your feed even if the invite was made before.
--
-- Older apps keep working: create_post still takes p_invite_count (links made at posting), now
-- under the friends-first rule.
-- Test: supabase/tests/tag_slots_test.sql (also invites_test, tag_challenges_test, feed_lock_test)
-- Undo: supabase/rollbacks/20261003120000_tag_slots.rollback.sql

-- 1. Settings. Changing it is a one-line migration: update public.app_config set max_open_invites = 20;
alter table public.app_config
  add column max_open_invites int not null default 10
    constraint app_config_max_open_invites_positive check (max_open_invites > 0);

-- 2. Where a slot is at.
alter table public.tag_challenges
  add column started_at timestamptz,
  add column requested_at timestamptz,   -- an in-app invite (someone on Mahi, not yet a friend)
  add column accepted_at timestamptz,
  add column declined_at timestamptz;
alter table public.invites add column shared_at timestamptz;

update public.tag_challenges c
set started_at = coalesce((select i.claimed_at from public.invites i where i.challenge_id = c.id),
                          c.created_at)
where c.expires_at is not null and c.started_at is null;

create index tag_challenges_unposted on public.tag_challenges (tagger_id)
  where post_id is null and cancelled_at is null;

-- 3. Two new notifications: the invite, and its yes.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag', 'tag_answered', 'tag_missed', 'invite_joined',
                  'streak_lost', 'tag_invite', 'tag_invite_accepted'));

-- 4. Internals.
-- Slots of yours still waiting for their 48 hours to start: unused links, unanswered invites,
-- and slots not posted with yet. The cap keeps one person from handing out links without end.
create function public.open_invite_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.tag_challenges
  where tagger_id = p_user and expires_at is null
    and cancelled_at is null and answered_at is null and missed_at is null;
$$;

-- The 48 hours start, and the tag bubble goes on the post (notify_on_tag makes the notification
-- and its push; queue_tag_pushes the reminders). Only for a slot with a post and a person who
-- said yes; anything else is left as it is.
create function public.start_tag(p_challenge uuid)
returns void
language sql
security definer
set search_path = public
as $$
  with started as (
    update public.tag_challenges c
    set expires_at = now() + cfg.tag_window, started_at = now()
    from public.app_config cfg
    where c.id = p_challenge
      and c.post_id is not null and c.tagged_id is not null and c.expires_at is null
      and (c.requested_at is null or c.accepted_at is not null)
      and c.cancelled_at is null and c.answered_at is null and c.missed_at is null
    returning c.post_id, c.tagged_id
  )
  insert into public.post_tags (post_id, user_id)
  select post_id, tagged_id from started
  on conflict do nothing;
$$;

-- 5. Slots and where each is at. No post: your slots not posted with yet (the tag screen). A
--    post of yours: its slots (the tag bubbles). Anyone else's post: nothing.
--    kind:  friend | request (in-app invite) | link
--    state: link_ready → shared → joined | invite_sent → accepted | tagged → answered | missed
--           | declined | expired | cancelled
create function public.get_tag_slots(p_post uuid default null)
returns table (
  challenge_id uuid, kind text, state text,
  user_id uuid, username text, display_name text, avatar_url text,
  token text, code text, url text,
  expires_at timestamptz, server_now timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select c.id as challenge_id,
           case when c.requested_at is not null then 'request'
                when i.token is not null then 'link'
                else 'friend' end as kind,
           case
             when c.answered_at is not null then 'answered'
             when c.declined_at is not null then 'declined'
             when c.missed_at is not null
                  or (c.expires_at is not null and now() > c.expires_at + cfg.answer_grace) then 'missed'
             when c.cancelled_at is not null then
               case when c.expires_at is null then 'expired' else 'cancelled' end
             when c.expires_at is not null then 'tagged'
             when c.requested_at is not null then
               case when c.accepted_at is not null then 'accepted'
                    when c.requested_at + cfg.invite_ttl < now() then 'expired'
                    else 'invite_sent' end
             when i.claimed_at is not null then 'joined'
             when i.expires_at < now() then 'expired'
             when i.shared_at is not null then 'shared'
             else 'link_ready'
           end as state,
           p.id as user_id, p.username, p.display_name, p.avatar_url,
           i.token, i.code, case when i.token is not null then cfg.invite_base_url || i.token end as url,
           c.expires_at, now() as server_now, c.created_at
    from public.tag_challenges c
    cross join public.app_config cfg
    left join public.invites i on i.challenge_id = c.id
    left join public.profiles p on p.id = c.tagged_id
    where c.tagger_id = auth.uid()
      and (case when p_post is null then c.post_id is null else c.post_id = p_post end)
  ) s
  where p_post is not null or s.state not in ('declined', 'expired', 'cancelled', 'missed', 'answered')
  order by s.created_at, s.challenge_id;
$$;

-- 6. A link, made on tap. Your next post must be one you're allowed to make.
create function public.make_invite_link()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_challenge uuid;
  v_inv public.invites;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  -- Serialise with everything else this user does (double taps, the cap).
  perform 1 from public.profiles where id = v_uid and not is_banned for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not v_cfg.invite_links_enabled then
    raise exception 'invite links are off' using errcode = '22023';
  end if;
  if not public.reactive_posting_open(v_uid) then
    raise exception 'reactive posting: not tagged' using errcode = 'P0001';
  end if;
  if public.open_invite_count(v_uid) >= v_cfg.max_open_invites then
    raise exception 'too many open invites' using errcode = '22023';
  end if;

  insert into public.tag_challenges (tagger_id) values (v_uid) returning id into v_challenge;
  insert into public.invites (token, code, inviter_id, challenge_id, expires_at)
  values (encode(extensions.gen_random_bytes(16), 'hex'), public.new_invite_code(), v_uid,
          v_challenge, now() + v_cfg.invite_ttl)
  returning * into v_inv;

  return jsonb_build_object(
    'challenge_id', v_challenge,
    'token', v_inv.token,
    'code', v_inv.code,
    'url', v_cfg.invite_base_url || v_inv.token);
end;
$$;

-- 7. An in-app invite for someone on Mahi who isn't your friend yet.
create function public.invite_to_tag(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_challenge uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  perform 1 from public.profiles where id = v_uid and not is_banned for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.reactive_posting_open(v_uid) then
    raise exception 'reactive posting: not tagged' using errcode = 'P0001';
  end if;
  if p_user is null or p_user = v_uid
     or not exists (select 1 from public.profiles where id = p_user and not is_banned)
     or exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user)
          or (b.blocker_id = p_user and b.blocked_id = v_uid))
  then
    raise exception 'cannot invite that person' using errcode = '22023';
  end if;
  if exists (select 1 from public.follows where follower_id = v_uid and following_id = p_user)
     and exists (select 1 from public.follows where follower_id = p_user and following_id = v_uid)
  then
    raise exception 'already friends' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.tag_challenges
    where tagger_id = v_uid and tagged_id = p_user
      and cancelled_at is null and answered_at is null and missed_at is null
  ) then
    raise exception 'already invited' using errcode = '22023';
  end if;
  if public.open_invite_count(v_uid) >= v_cfg.max_open_invites then
    raise exception 'too many open invites' using errcode = '22023';
  end if;

  insert into public.tag_challenges (tagger_id, tagged_id, requested_at)
  values (v_uid, p_user, now())
  returning id into v_challenge;
  insert into public.notifications (user_id, actor_id, type, challenge_id)
  values (p_user, v_uid, 'tag_invite', v_challenge);

  return jsonb_build_object('challenge_id', v_challenge);
end;
$$;

-- 8. Accept or "Not now", by the person invited.
create function public.respond_tag_invite(p_challenge uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_c public.tag_challenges;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  select * into v_c from public.tag_challenges
  where id = p_challenge and tagged_id = v_uid and requested_at is not null
  for update;

  -- Pressing Accept twice gives the same answer.
  if found and p_accept and v_c.accepted_at is not null and v_c.cancelled_at is null then
    return jsonb_build_object('accepted', true);
  end if;
  if not found
     or v_c.accepted_at is not null or v_c.cancelled_at is not null
     or v_c.answered_at is not null or v_c.missed_at is not null
     or v_c.requested_at + v_cfg.invite_ttl < now()
     or not exists (select 1 from public.profiles where id = v_c.tagger_id and not is_banned)
     or exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_c.tagger_id)
          or (b.blocker_id = v_c.tagger_id and b.blocked_id = v_uid))
  then
    raise exception 'that invite is no longer open' using errcode = '22023';
  end if;

  if not p_accept then
    update public.tag_challenges set declined_at = now(), cancelled_at = now() where id = v_c.id;
    return jsonb_build_object('accepted', false);
  end if;

  insert into public.follows (follower_id, following_id)
  values (v_uid, v_c.tagger_id), (v_c.tagger_id, v_uid)
  on conflict do nothing;
  update public.tag_challenges set accepted_at = now() where id = v_c.id;
  perform public.start_tag(v_c.id);
  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  values (v_c.tagger_id, v_uid, 'tag_invite_accepted', v_c.post_id, v_c.id);

  return jsonb_build_object('accepted', true);
end;
$$;

-- 9. Taking a slot back before posting.
create function public.cancel_tag_slot(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tag_challenges
  set cancelled_at = now()
  where id = p_challenge and tagger_id = auth.uid() and post_id is null
    and expires_at is null and cancelled_at is null and answered_at is null;
  if not found then
    raise exception 'that invite is no longer open' using errcode = '22023';
  end if;
end;
$$;

-- 10. The share sheet closed with the link sent somewhere. (No app can prove it reached anyone;
--     the slot only becomes a tag when its person joins.)
create function public.mark_invite_shared(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invites
  set shared_at = coalesce(shared_at, now())
  where challenge_id = p_challenge and inviter_id = auth.uid();
  if not found then
    raise exception 'that invite is no longer open' using errcode = '22023';
  end if;
end;
$$;

-- 11. The tag screen's search. Nothing typed: your friends (as get_taggable_friends). Typed:
--     anyone on Mahi, friends first. Never you, the banned, or anyone blocked either way.
create function public.search_tag_people(p_query text default '', p_limit int default 50)
returns table (
  id uuid, username text, display_name text, avatar_url text, is_friend boolean,
  has_open_tag boolean, tagged_you boolean, points int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, f.id is not null,
         coalesce(f.has_open_tag, exists (
           select 1 from public.tag_challenges c
           where c.tagger_id = auth.uid() and c.tagged_id = p.id
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
         )),
         exists (
           select 1 from public.tag_challenges c
           cross join public.app_config cfg
           where c.tagger_id = p.id and c.tagged_id = auth.uid()
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
             and now() <= c.expires_at + cfg.answer_grace
         ),
         p.streak_current
  from public.profiles p
  left join public.taggable_friends(auth.uid()) f on f.id = p.id
  where p.id <> auth.uid() and not p.is_banned
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
    and case
          when btrim(coalesce(p_query, '')) = '' then f.id is not null
          else strpos(lower(p.username), lower(btrim(p_query))) > 0
            or strpos(lower(coalesce(p.display_name, '')), lower(btrim(p_query))) > 0
        end
  order by f.id is null, 6, p.username
  limit least(greatest(p_limit, 1), 100);
$$;

-- 12. Posting takes the slots (20261002190000_tag_and_feed_pushes' body, plus p_slot_ids, the
--     friends-first rule, started_at, and dropping the slots not posted with).
drop function public.create_post(uuid, text, text, text, uuid[], double precision, double precision,
                                 int, text, text);
create function public.create_post(
  p_client_id uuid,
  p_image_path text,
  p_pov_image_path text default null,
  p_caption text default null,
  p_tagged_ids uuid[] default '{}',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_invite_count int default 0,
  p_rear_media_type text default 'photo',
  p_front_media_type text default 'photo',
  p_slot_ids uuid[] default '{}'
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
  v_slots uuid[] := array(select distinct s from unnest(coalesce(p_slot_ids, '{}')) s);
  v_invites int := greatest(coalesce(p_invite_count, 0), 0);
  v_open int;
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
      'slots', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.get_tag_slots(v_post.id) s),
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

  -- Every slot is yours, not posted with yet, and still open (not taken back, declined or run out).
  if (select count(*) from public.tag_challenges c
      cross join public.app_config cfg
      where c.id = any(v_slots) and c.tagger_id = v_uid and c.post_id is null
        and c.expires_at is null
        and c.cancelled_at is null and c.answered_at is null and c.missed_at is null
        and not (c.requested_at is not null and c.accepted_at is null
                 and c.requested_at + cfg.invite_ttl < now())
        and not exists (select 1 from public.invites i
                        where i.challenge_id = c.id and i.claimed_at is null and i.expires_at < now())
     ) <> cardinality(v_slots) then
    raise exception 'that invite is no longer open' using errcode = '22023';
  end if;
  -- Slots still waiting on someone (a link nobody joined from, an invite not yet accepted).
  select v_invites + count(*) into v_open
  from public.tag_challenges c
  where c.id = any(v_slots)
    and ((c.requested_at is not null and c.accepted_at is null)
         or exists (select 1 from public.invites i where i.challenge_id = c.id and i.claimed_at is null));

  select count(*) into v_available from public.taggable_friends(v_uid) where not has_open_tag;
  -- Once invite links are switched on, an empty slot can always be filled by an invite, so every
  -- post carries the full three. Until then, having too few friends still excuses the difference.
  v_required := case
    when not v_cfg.tags_required then 0
    when v_cfg.invite_links_enabled then v_cfg.tag_count
    else least(v_cfg.tag_count, v_available)
  end;
  if cardinality(v_tags) + v_invites + cardinality(v_slots) < v_required
     or cardinality(v_tags) + v_invites + cardinality(v_slots) > greatest(v_cfg.tag_count, 1) then
    raise exception 'tag or invite % people', v_required
      using errcode = '22023', detail = json_build_object('required', v_required)::text;
  end if;
  -- Friends first: a slot waits on someone only when every friend you could tag is tagged.
  if v_open > 0 and cardinality(v_tags) < v_available then
    raise exception 'tag your friends first'
      using errcode = '22023', detail = json_build_object('available', v_available)::text;
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
  insert into public.tag_challenges (post_id, tagger_id, tagged_id, expires_at, started_at)
  select v_post.id, v_uid, t, now() + v_cfg.tag_window, now() from unnest(v_tags) t order by t;

  -- Tag bubbles; notify_on_tag turns each into a notification and its deadline push.
  insert into public.post_tags (post_id, user_id) select v_post.id, unnest(v_tags);

  -- The slots go on the post. One whose person already joined or accepted starts now.
  update public.tag_challenges set post_id = v_post.id where id = any(v_slots);
  perform public.start_tag(s) from unnest(v_slots) s order by s;
  -- Slots made but not posted with are dropped (their links still make friends, without a tag).
  update public.tag_challenges
  set cancelled_at = now()
  where tagger_id = v_uid and post_id is null and expires_at is null
    and cancelled_at is null and answered_at is null and missed_at is null;

  -- Slots filled by an invite: a challenge with nobody in it yet, and a link each (older apps).
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
    'slots', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.get_tag_slots(v_post.id) s),
    'replayed', false
  );
end;
$$;

-- 13. Joining from a link (20261002190000_tag_and_feed_pushes' body): the link's slot gets its
--     person; its 48 hours start only if it is on a post already (start_tag).
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

  -- The slot gets its person. A slot taken back or dropped stays that way: friends, no tag.
  update public.tag_challenges
  set tagged_id = v_uid
  where id = v_inv.challenge_id
    and tagged_id is null and cancelled_at is null and answered_at is null
  returning * into v_c;
  if found then
    perform public.start_tag(v_c.id);
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  values (v_inv.inviter_id, v_uid, 'invite_joined', v_c.post_id, v_c.id);

  return public.invite_result(v_inv);
end;
$$;

-- 14. Feed lock (20261001120000_reactive_posting's rule): a tag counts from when its 48 hours
--     started, and a slot still waiting is nobody's tag.
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
          where c.tagged_id = p_viewer and c.expires_at is not null
            and coalesce(c.started_at, c.created_at) > last.at and c.cancelled_at is null
        ))
  )
  from public.app_config cfg
  cross join (select max(created_at) as at from public.posts where user_id = p_viewer) last;
$$;

-- 15. The feed-lock pushes follow the same rule (20261002190000_tag_and_feed_pushes' body; only
--     the "made since that post" line changes).
create or replace function public.schedule_feed_lock_pushes(p_user uuid)
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
    and coalesce(c.started_at, c.created_at) > v_post.created_at
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

-- 16. Reminders when a tag's 48 hours start — now also when they start after its person was
--     set (an accepted invite, a joined link posted with). 20261002190000's body otherwise.
create or replace function public.queue_tag_pushes()
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

  if (tg_op = 'INSERT' or old.tagged_id is null or old.expires_at is null)
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

drop trigger queue_tag_pushes on public.tag_challenges;
create trigger queue_tag_pushes
  after insert or update of tagged_id, expires_at, answered_at, cancelled_at, missed_at
  on public.tag_challenges
  for each row execute function public.queue_tag_pushes();

-- 17. Run-out clean-up (20260917121508_invites' link rule, plus): slots nobody posted with, and
--     in-app invites nobody answered, are cancelled after invite_ttl (7 days).
create or replace function public.expire_invites()
returns void
language sql
security definer
set search_path = public
as $$
  update public.tag_challenges c
  set cancelled_at = now()
  from public.invites i
  where i.challenge_id = c.id
    and i.claimed_at is null
    and i.expires_at < now()
    and c.tagged_id is null
    and c.cancelled_at is null
    and c.answered_at is null;

  update public.tag_challenges c
  set cancelled_at = now()
  from public.app_config cfg
  where c.expires_at is null
    and c.cancelled_at is null and c.answered_at is null and c.missed_at is null
    and ((c.post_id is null and c.created_at < now() - cfg.invite_ttl)
         or (c.requested_at is not null and c.accepted_at is null
             and c.requested_at < now() - cfg.invite_ttl));
$$;

-- 18. The two new pushes (20261002190000_tag_and_feed_pushes' body, plus their words; "answered
--     in" counts from when the 48 hours started). The app's list uses the same words
--     (src/lib/notificationText.ts).
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
        v_actor || ' answered your tag in '
          || public.format_wait(v_c.answered_at - coalesce(v_c.started_at, v_c.created_at))
      when 'tag_missed' then v_actor || ' missed your tag'
      when 'invite_joined' then v_actor || ' joined Mahi from your invite'
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your points are back to 0.'
      when 'tag_invite' then v_actor || ' wants to tag you'
      when 'tag_invite_accepted' then v_actor || ' accepted your tag'
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

-- 19. Live slot states for the person tagging (RLS: only your own rows reach you).
alter publication supabase_realtime add table public.tag_challenges;

-- 20. Who may call what.
revoke execute on function
  public.open_invite_count(uuid),
  public.start_tag(uuid),
  public.get_tag_slots(uuid),
  public.make_invite_link(),
  public.invite_to_tag(uuid),
  public.respond_tag_invite(uuid, boolean),
  public.cancel_tag_slot(uuid),
  public.mark_invite_shared(uuid),
  public.search_tag_people(text, int),
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int, text,
                     text, uuid[])
from public, anon, authenticated;

grant execute on function
  public.get_tag_slots(uuid),
  public.make_invite_link(),
  public.invite_to_tag(uuid),
  public.respond_tag_invite(uuid, boolean),
  public.cancel_tag_slot(uuid),
  public.mark_invite_shared(uuid),
  public.search_tag_people(text, int),
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int, text,
                     text, uuid[])
to authenticated;

notify pgrst, 'reload schema';
