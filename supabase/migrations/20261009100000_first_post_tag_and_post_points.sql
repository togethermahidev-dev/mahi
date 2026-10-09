-- Core workflow (owner, 2026-10-09): the first post tags one person, a deleted post gives its point
-- back, and a post shows whom it answered and whom it invited.
-- 1. app_config.first_post_tags (default 1, 0 to tag_count) is the server switch for the first
--    post. create_post: a first post tags exactly that many (friends + link slots + invites);
--    without invite links, too few friends still excuses the difference. At 0 the first post tags
--    0 to tag_count again (the 20261008140000_first_workout_no_tags rule). Answers still tag
--    tag_count. The error is the same ('tag or invite N people', 22023); its detail is now
--    {"required": N, "max": M}.
-- 2. posts.earned_point: true for a post that earned a Mahi point (a first post, or one that
--    answers a tag). Set by create_post; backfilled for each person's first post and every post a
--    tag_challenges.answered_post_id points at.
-- 3. delete_post: a post that earned a point takes 1 off streak_current (never below 0) unless a
--    tag of yours was missed after the post (the miss already reset you). streak_highest never
--    changes. The answer gains 'streak' {streak_current, streak_highest}.
-- 4. feed_item (every feed and profile post) gains answered_taggers [{user_id, username}] (every
--    tag the post answered, oldest first, banned taggers left out) and pending_invites
--    [{initials}] (link slots on the post nobody has joined from yet, still live). Initials come
--    from the internal name_initials(invites.sent_to_name); never the name, number, token, code or
--    slot id. Both are [] when the post is locked for the viewer.
-- 5. push_on_notification: joining from a tag link (invite_joined with a challenge) reads
--    "Joe joined Mahi from your tag 🎉" (first name, else display name, else @username). General
--    invite links keep their two wordings.
-- Previous definitions: create_post and push_on_notification from 20261008170000_private_accounts;
-- delete_post from 20261006200000_maximus_answers; feed_item from 20261007250000_answer_timing.
-- Test: supabase/tests/first_post_one_tag_test.sql, supabase/tests/delete_post_point_test.sql,
--   supabase/tests/feed_tag_people_test.sql, supabase/tests/tag_joined_push_test.sql
-- Undo: supabase/rollbacks/20261009100000_first_post_tag_and_post_points.rollback.sql

-- 1. The first-post switch. Changing it is a one-line migration:
--    update public.app_config set first_post_tags = 0;
alter table public.app_config
  add column first_post_tags int not null default 1;
alter table public.app_config
  add constraint app_config_first_post_tags_check check (first_post_tags >= 0 and first_post_tags <= tag_count);

-- 2. Which posts earned a point.
alter table public.posts
  add column earned_point boolean not null default false;
update public.posts p
set earned_point = true
where not p.earned_point
  and (not exists (select 1 from public.posts e
                   where e.user_id = p.user_id and (e.created_at, e.id) < (p.created_at, p.id))
       or exists (select 1 from public.tag_challenges c where c.answered_post_id = p.id));

-- 3. Initials for an invited name: the first letter of the first and last words, upper case.
--    'Sam Lee' -> 'SL', 'ann' -> 'A', null or blank -> null. Internal only.
create function public.name_initials(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(upper(
           coalesce(substring(w[1] from '[[:alpha:]]'), '')
           || case when cardinality(w) > 1
                   then coalesce(substring(w[cardinality(w)] from '[[:alpha:]]'), '')
                   else '' end), '')
  from (select regexp_split_to_array(btrim(p_name), '\s+') as w) s
  where nullif(btrim(p_name), '') is not null;
$$;

-- 4. create_post as 20261008170000_private_accounts; only the count rule (first_post_tags, detail
--    with max) and posts.earned_point change.
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
  v_available int;
  v_required int;
  v_max int;
  v_first_post boolean;
  v_answers boolean;
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
  select count(*) into v_available from public.taggable_friends(v_uid) where not has_open_tag;
  -- Your first ever post (`has_posted_before` is set by the posts trigger after the insert below),
  -- and whether this post answers a mate's tag that is still open.
  v_first_post := not coalesce(v_profile.has_posted_before, false);
  v_answers := exists (
    select 1 from public.tag_challenges c
    where c.tagged_id = v_uid
      and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
      and c.expires_at >= now() - v_cfg.answer_grace
  );
  -- The first post tags exactly first_post_tags (2026-10-09); at 0 it may tag nobody, up to
  -- tag_count (the 2026-10-08 rule). Answers tag tag_count. Once invite links are switched on, an
  -- empty slot can always be filled by an invite, so every post carries the full count. Until then,
  -- having too few friends still excuses the difference.
  v_required := case
    when not v_cfg.tags_required then 0
    when v_first_post and v_cfg.invite_links_enabled then v_cfg.first_post_tags
    when v_first_post then least(v_cfg.first_post_tags, v_available)
    when v_cfg.invite_links_enabled then v_cfg.tag_count
    else least(v_cfg.tag_count, v_available)
  end;
  v_max := case
    when v_first_post and v_cfg.tags_required and v_cfg.first_post_tags > 0 then v_cfg.first_post_tags
    else greatest(v_cfg.tag_count, 1)
  end;
  if cardinality(v_tags) + v_invites + cardinality(v_slots) < v_required
     or cardinality(v_tags) + v_invites + cardinality(v_slots) > v_max then
    raise exception 'tag or invite % people', v_required
      using errcode = '22023',
            detail = json_build_object('required', v_required, 'max', v_max)::text;
  end if;
  -- Existing friends and people not on Mahi are equal choices. A waiting invite may fill any slot;
  -- nobody needs to unfollow a friend to make the invite option available. Someone who takes tags
  -- from everyone is tagged straight away too (Controls, 2026-10-08).
  if exists (
    select 1 from unnest(v_tags) t(id)
    where t.id not in (select f.id from public.taggable_friends(v_uid) f where not f.has_open_tag)
      and not (
        t.id <> v_uid
        and exists (select 1 from public.profiles pr
                    where pr.id = t.id and not pr.is_banned and pr.tag_permission = 'everyone')
        and not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = v_uid and b.blocked_id = t.id)
             or (b.blocker_id = t.id and b.blocked_id = v_uid))
        and not exists (
          select 1 from public.tag_challenges c
          where c.tagger_id = v_uid and c.tagged_id = t.id
            and c.answered_at is null and c.cancelled_at is null and c.missed_at is null)
      )
  ) then
    raise exception 'cannot tag that person' using errcode = '22023';
  end if;

  -- Mahi points: +1 for your first ever post (Maximus, 2026-10-07), or for a post that answers
  -- at least one tag; one point either way, however many tags it answers. `has_posted_before`
  -- is still false here for a first post: the posts trigger sets it after the insert below.
  if v_first_post or v_answers then
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
    caption, streak_day, latitude, longitude, earned_point
  )
  values (
    v_uid, p_client_id, v_base || p_image_path,
    case when p_pov_image_path is not null then v_base || p_pov_image_path end,
    p_image_path, p_pov_image_path,
    v_rear_type, v_front_type,
    nullif(btrim(p_caption), ''),
    v_profile.streak_current,
    case when v_has_coords then p_latitude end,
    case when v_has_coords then p_longitude end,
    v_first_post or v_answers
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

-- 5. delete_post as 20261006200000_maximus_answers, plus the point back and the new streak.
create or replace function public.delete_post(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_post
  from public.posts
  where id = p_post and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'post not found' using errcode = '22023';
  end if;

  delete from public.posts where id = v_post.id;

  -- The point this post earned goes back, unless a missed tag already put the points to 0 after
  -- it. A miss marked by this post's own create_post has the same time as the post and came
  -- before it, so only a later one counts. Best never changes.
  if v_post.earned_point and not exists (
    select 1 from public.tag_challenges c
    where c.tagged_id = auth.uid() and c.missed_at > v_post.created_at
  ) then
    update public.profiles
    set streak_current = greatest(streak_current - 1, 0)
    where id = auth.uid()
    returning * into v_profile;
  else
    select * into v_profile from public.profiles where id = auth.uid();
  end if;

  return jsonb_build_object(
    'image_path', v_post.image_path,
    'pov_image_path', v_post.pov_image_path,
    'streak', jsonb_build_object(
      'streak_current', v_profile.streak_current,
      'streak_highest', v_profile.streak_highest)
  );
end;
$$;

-- 6. feed_item as 20261007250000_answer_timing, plus answered_taggers and pending_invites.
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
    'answered_taggers', case when p_hide then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('user_id', t.id, 'username', t.username)
                       order by c.created_at, c.id)
      from public.tag_challenges c
      join public.profiles t on t.id = c.tagger_id
      where c.answered_post_id = p.id and not t.is_banned
    ), '[]'::jsonb) end,
    'pending_invites', case when p_hide then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('initials', public.name_initials(i.sent_to_name))
                       order by c.created_at, c.id)
      from public.tag_challenges c
      join public.invites i on i.challenge_id = c.id
      where c.post_id = p.id and c.tagged_id is null and c.cancelled_at is null
        and i.claimed_at is null and i.cancelled_at is null and i.expires_at > now()
    ), '[]'::jsonb) end,
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

-- 7. push_on_notification as 20261008170000_private_accounts; only the tag-link join wording changes.
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_name text;
  v_c public.tag_challenges;
begin
  select '@' || username,
         coalesce(nullif(btrim(first_name), ''), nullif(btrim(display_name), ''), '@' || username)
  into v_actor, v_name
  from public.profiles where id = new.actor_id;

  if new.challenge_id is not null then
    select * into v_c from public.tag_challenges where id = new.challenge_id;
  elsif new.type = 'tag' then
    select * into v_c from public.tag_challenges
    where post_id = new.post_id and tagged_id = new.user_id;
  end if;

  perform public.enqueue_push(
    new.user_id,
    new.actor_id,
    new.type,
    case new.type
      when 'like' then v_actor || ' liked your post'
      when 'comment' then v_actor || ' commented on your post'
      when 'follow' then v_actor || ' started following you'
      when 'tag' then
        case when v_c.id is null or v_c.expires_at is null then v_actor || ' tagged you in a post'
             else v_actor || ' tagged you. Post any workout by {deadline}.' end
      when 'tag_answered' then
        v_actor || ' answered your tag in '
          || public.format_duration(v_c.answered_at - coalesce(v_c.started_at, v_c.created_at))
      when 'tag_missed' then
        v_actor || ' missed your tag. Tag them in your next post to get them going again.'
      when 'invite_joined' then
        case when new.challenge_id is not null
             then v_name || ' joined Mahi from your tag 🎉'
             when coalesce(new.follow_request, false)
             then v_actor || ' joined Mahi from your invite and wants to follow you.'
             else v_actor || ' joined Mahi from your invite. You follow each other now.' end
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your points are back to 0.'
      when 'tag_invite' then v_actor || ' wants to tag you.'
      when 'tag_invite_accepted' then v_actor || ' accepted your tag request.'
      when 'follow_request' then v_actor || ' wants to follow you'
      when 'follow_accepted' then v_actor || ' accepted your follow request'
      else v_actor
    end,
    jsonb_build_object(
      'route', case
        when new.type = 'follow' then 'profile'
        when new.type = 'tag' and v_c.id is not null then 'camera'
        when new.type = 'invite_joined' then 'profile'
        when new.type = 'follow_request' then 'notifications'
        when new.type = 'follow_accepted' then 'profile'
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

-- 8. Who may call what. create_post, delete_post and feed_item keep their grants (replaced, not
--    recreated); restated here.
revoke execute on function public.name_initials(text) from public, anon, authenticated;
revoke execute on function
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int, text,
                     text, uuid[])
from public, anon;
grant execute on function
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int, text,
                     text, uuid[])
to authenticated;
revoke all on function public.delete_post(uuid) from public, anon;
grant execute on function public.delete_post(uuid) to authenticated;
revoke execute on function public.feed_item(public.posts, uuid, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
