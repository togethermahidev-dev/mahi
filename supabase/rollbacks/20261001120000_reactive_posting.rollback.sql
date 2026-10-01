-- Undo 20261001120000_reactive_posting. Puts back "one post a day", the daily streak function,
-- the old create_post, mark_missed_tags, push text and feed lock, and drops the reactive posting
-- helper, the streak breaker and tag_challenges.streak_broken_at.
-- Not undone: streaks reset to 0 on the day this ran stay reset (the old values are gone).
-- The one-post-a-day index can only come back if nobody has two posts on one local day: delete or
-- keep those posts first (this file stops with a duplicate-key error otherwise).
begin;

-- The daily streak function (as 20260406123426_fix_record_upload_streak_comment left it).

CREATE OR REPLACE FUNCTION public.record_upload_streak(p_user_id uuid, p_upload_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_profile     public.profiles%ROWTYPE;
  v_last        date;
  v_new_current integer;
  v_new_highest integer;
  v_new_lowest  integer;
  v_action      text;
  v_day_name    text;
  v_is_rest     boolean := false;
BEGIN
  -- Auth guard: callers can only update their own streak
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock row to prevent race condition on double-tap
  SELECT * INTO v_profile
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_last := v_profile.streak_last_upload_date::date;

  -- Idempotent: already uploaded today
  IF v_last = p_upload_date THEN
    RETURN jsonb_build_object(
      'streak_current', v_profile.streak_current,
      'streak_highest', v_profile.streak_highest,
      'streak_lowest',  v_profile.streak_lowest,
      'action',         'already_uploaded_today'
    );
  END IF;

  -- Rest day check: fitness_routine stores comma-separated full day names
  -- e.g. 'Monday,Wednesday,Friday'. Days absent from the list are rest days.
  -- to_char 'Dy' produces 3-letter abbreviations ('Mon','Tue',...) which are
  -- always a prefix/substring of the full name, so position() works correctly.
  IF v_profile.fitness_routine IS NOT NULL AND v_profile.fitness_routine <> '' THEN
    v_day_name := to_char(p_upload_date, 'Dy');
    v_is_rest  := position(v_day_name IN v_profile.fitness_routine) = 0;
  END IF;

  -- Extend: first upload, uploaded yesterday, or today is a rest day
  IF v_last IS NULL OR v_last = p_upload_date - interval '1 day' OR v_is_rest THEN
    v_new_current := v_profile.streak_current + 1;
    v_action      := 'extended';
  ELSE
    -- Missed a required day: close active log and reset
    UPDATE public.streak_logs
    SET is_active    = false,
        ended_at     = v_last,
        streak_count = v_profile.streak_current
    WHERE user_id = p_user_id AND is_active = true;
    v_new_current := 1;
    v_action      := 'reset';
  END IF;

  v_new_highest := GREATEST(v_profile.streak_highest, v_new_current);
  v_new_lowest  := CASE
    WHEN v_action = 'reset' AND v_profile.streak_current > 0
      THEN LEAST(COALESCE(v_profile.streak_lowest, v_profile.streak_current), v_profile.streak_current)
    ELSE v_profile.streak_lowest
  END;

  -- Update profile with authoritative streak values
  UPDATE public.profiles SET
    streak_current          = v_new_current,
    streak_highest          = v_new_highest,
    streak_lowest           = v_new_lowest,
    streak_last_upload_date = p_upload_date,
    updated_at              = now()
  WHERE id = p_user_id;

  -- Manage streak_logs: open new log on reset, update count on extend
  IF v_action = 'reset' THEN
    INSERT INTO public.streak_logs (user_id, streak_count, started_at, is_active)
    VALUES (p_user_id, 1, p_upload_date, true);
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.streak_logs WHERE user_id = p_user_id AND is_active = true
    ) THEN
      UPDATE public.streak_logs SET streak_count = v_new_current
      WHERE user_id = p_user_id AND is_active = true;
    ELSE
      INSERT INTO public.streak_logs (user_id, streak_count, started_at, is_active)
      VALUES (p_user_id, v_new_current, p_upload_date, true);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'streak_current', v_new_current,
    'streak_highest', v_new_highest,
    'streak_lowest',  v_new_lowest,
    'action',         v_action
  );
END;
$function$;

grant execute on function public.record_upload_streak(uuid, date) to authenticated;

-- Posting once a day, with the daily streak.
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
  v_today date;
  v_streak jsonb;
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
        'streak_highest', v_profile.streak_highest,
        'streak_lowest', v_profile.streak_lowest),
      'answered', public.answered_by_post(v_post.id),
      'invites', public.post_invites(v_post.id),
      'replayed', true
    );
  end if;

  v_today := (now() at time zone v_profile.timezone)::date;
  if exists (select 1 from public.posts where user_id = v_uid and post_date = v_today) then
    raise exception 'already posted today' using errcode = 'P0001';
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

  -- Expired tags from this user no longer block re-tagging the same friend.
  update public.tag_challenges c
  set missed_at = now()
  where c.tagger_id = v_uid
    and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
    and c.expires_at + v_cfg.answer_grace < now();

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

  v_streak := public.record_upload_streak(v_uid, v_today);

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
    (v_streak ->> 'streak_current')::int,
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
    'streak', v_streak,
    'answered', public.answered_by_post(v_post.id),
    'invites', public.post_invites(v_post.id),
    'replayed', false
  );
end;
$$;

create unique index posts_user_post_date_unique on public.posts (user_id, post_date);

-- Both people hear "tag_missed" again; no "streak_lost".
create or replace function public.mark_missed_tags()
returns void
language sql
security definer
set search_path = public
as $$
  with due as (
    select c.id
    from public.tag_challenges c
    cross join public.app_config cfg
    where c.answered_at is null and c.cancelled_at is null and c.missed_notified_at is null
      and c.expires_at + cfg.answer_grace < now()
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
  select tagged_id, tagger_id, 'tag_missed', post_id, id from marked;
$$;


update public.notifications set type = 'tag_missed' where type = 'streak_lost';
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag', 'tag_answered', 'tag_missed', 'invite_joined'));

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
      when 'tag_missed' then
        case when new.user_id = v_c.tagger_id then v_actor || ' missed your tag'
             else 'You missed ' || v_actor || '''s tag' end
      when 'invite_joined' then v_actor || ' joined Mahi from your invite'
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


-- Any tag after your last post locks the feed again, cancelled or not.
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
          where c.tagged_id = p_viewer and c.created_at > last.at
        ))
  )
  from public.app_config cfg
  cross join (select max(created_at) as at from public.posts where user_id = p_viewer) last;
$$;

drop function public.break_missed_streaks(uuid);
drop function public.reactive_posting_open(uuid);
drop index public.tag_challenges_streak_unbroken;
alter table public.tag_challenges drop column streak_broken_at;

notify pgrst, 'reload schema';
commit;
