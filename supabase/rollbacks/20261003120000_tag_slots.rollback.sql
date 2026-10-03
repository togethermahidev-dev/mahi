-- Undo 20261003120000_tag_slots: slots made before posting, in-app invites, friends first, the
-- slot states and live updates go. Posting takes an invite count again (links made at posting).
-- Slots still waiting (links not yet posted with, invites not yet accepted) are cancelled first,
-- so the older rules never read them as tags. Friendships made by accepting stay. Notifications
-- of the two new kinds are deleted (the older constraint does not allow them).
-- The app with switch `tag-slots` off keeps working either way.
begin;

-- Waiting slots would read as tags (and lock feeds) under the older rules: cancel them.
update public.tag_challenges
set cancelled_at = now()
where expires_at is null and cancelled_at is null and answered_at is null and missed_at is null;

alter publication supabase_realtime drop table public.tag_challenges;

drop function public.get_tag_slots(uuid);
drop function public.make_invite_link();
drop function public.invite_to_tag(uuid);
drop function public.respond_tag_invite(uuid, boolean);
drop function public.cancel_tag_slot(uuid);
drop function public.mark_invite_shared(uuid);
drop function public.search_tag_people(text, int);

-- create_post as 20261002190000_tag_and_feed_pushes left it.
drop function public.create_post(uuid, text, text, text, uuid[], double precision, double precision,
                                 int, text, text, uuid[]);
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

revoke execute on function
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int, text, text)
from public, anon, authenticated;
grant execute on function
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int, text, text)
to authenticated;

-- claim_invite as 20261002190000_tag_and_feed_pushes left it.
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

drop function public.start_tag(uuid);
drop function public.open_invite_count(uuid);

-- viewer_is_locked as 20261001120000_reactive_posting left it.
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

-- schedule_feed_lock_pushes, queue_tag_pushes and push_on_notification as
-- 20261002190000_tag_and_feed_pushes left them.
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

drop trigger queue_tag_pushes on public.tag_challenges;
create trigger queue_tag_pushes
  after insert or update of tagged_id, answered_at, cancelled_at, missed_at on public.tag_challenges
  for each row execute function public.queue_tag_pushes();

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

-- expire_invites as 20260917121508_invites left it.
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
$$;

delete from public.notifications where type in ('tag_invite', 'tag_invite_accepted');
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag', 'tag_answered', 'tag_missed', 'invite_joined',
                  'streak_lost'));

drop index public.tag_challenges_unposted;
alter table public.invites drop column shared_at;
alter table public.tag_challenges
  drop column started_at,
  drop column requested_at,
  drop column accepted_at,
  drop column declined_at;
alter table public.app_config drop column max_open_invites;

delete from supabase_migrations.schema_migrations where version = '20261003120000';

notify pgrst, 'reload schema';

commit;
