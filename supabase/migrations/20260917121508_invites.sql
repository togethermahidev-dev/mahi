-- Invite links (tag-loop plan, Phase 7, expand step; decisions #2, #8).
-- A tag slot can be filled by someone who isn't on Mahi: the post makes a challenge with nobody
-- in it yet plus a link. When they sign up and claim the link, the challenge gets its person and
-- starts its 48-hour clock. Until the contract step flips `invite_links_enabled`, posting with
-- fewer than 3 tags is still allowed when you don't have 3 friends, so old app builds keep working.
-- Test: supabase/tests/invites_test.sql

-- 1. Settings.
alter table public.app_config
  add column invite_ttl interval not null default '7 days',
  add column invite_base_url text not null default 'https://togethermahi.com/i/',
  add column invite_links_enabled boolean not null default false;

-- 2. A challenge can be waiting for someone who hasn't joined yet: no person, no clock.
--    Every rule that reads these compares against now(), and a null never matches, so a pending
--    invite is never answered, never missed and never shows in anyone's open tags.
alter table public.tag_challenges alter column tagged_id drop not null;
alter table public.tag_challenges alter column expires_at drop not null;

-- 3. The link: a token for the URL and a 6-character code to read out or type in.
create table public.invites (
  token text primary key,
  code text not null,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.tag_challenges(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz
);
create unique index invites_code_key on public.invites (lower(code));
create index invites_inviter_idx on public.invites (inviter_id);
create index invites_challenge_idx on public.invites (challenge_id);
create index invites_unclaimed_idx on public.invites (expires_at) where claimed_at is null;
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- 4. The inviter hears about it.
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

-- 5. A code someone reads off a screen: no 0/O/1/I, and never one already in use.
create function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_code text;
begin
  for i in 1..10 loop
    select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (get_byte(s.b, n) % 32), 1), '')
      into v_code
      from (select extensions.gen_random_bytes(6) b) s, generate_series(0, 5) n;
    if not exists (select 1 from public.invites where lower(code) = lower(v_code)) then
      return v_code;
    end if;
  end loop;
  raise exception 'could not make an invite code' using errcode = '55000';
end;
$$;

-- 6. A post's invite links, for the share sheet. Same links on a retry.
create function public.post_invites(p_post uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'token', i.token,
           'code', i.code,
           'url', cfg.invite_base_url || i.token,
           'claimed', i.claimed_at is not null
         ) order by i.created_at, i.token), '[]'::jsonb)
  from public.invites i
  join public.tag_challenges c on c.id = i.challenge_id
  cross join public.app_config cfg
  where c.post_id = p_post;
$$;

-- 7. Posting can now fill a slot with an invite instead of a friend.
drop function public.create_post(uuid, text, text, text, uuid[], double precision, double precision);
create function public.create_post(
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

-- 8. What the app shows once an invite is claimed.
create function public.invite_result(i public.invites)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'claimed', i.claimed_at is not null,
    'inviter', jsonb_build_object(
      'id', p.id, 'username', p.username,
      'display_name', p.display_name, 'avatar_url', p.avatar_url),
    'expires_at', c.expires_at,
    'server_now', now())
  from public.profiles p
  left join public.tag_challenges c on c.id = i.challenge_id
  where p.id = i.inviter_id;
$$;

-- 9. Joining from a link: follow each other, and the tag starts now.
create function public.claim_invite(p_token text)
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

    perform public.enqueue_push(
      v_uid, v_inv.inviter_id, 'tag_reminder',
      r.hours_left || ' hours left to answer @' || v_inviter.username,
      jsonb_build_object('route', 'camera'),
      v_c.expires_at - make_interval(hours => r.hours_left),
      'tag:' || v_c.id || ':' || r.hours_left || 'h',
      v_c.id,
      v_c.expires_at
    )
    from (values (24), (2)) r(hours_left);
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  values (v_inv.inviter_id, v_uid, 'invite_joined', v_c.post_id, v_c.id);

  return public.invite_result(v_inv);
end;
$$;

-- 10. Who sent the link — for the landing page and the sign-up screen, before anyone signs in.
--     Unknown token or code → nothing back, so a guess tells you nothing either way.
create function public.get_invite_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'open', i.claimed_at is null and i.expires_at > now())
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and not p.is_banned
  where i.token = p_token or lower(i.code) = lower(btrim(coalesce(p_token, '')));
$$;

-- 11. A link nobody used: cancel its challenge so the counts stay honest.
create function public.expire_invites()
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

select cron.schedule('expire-invites', '17 * * * *', $$select public.expire_invites()$$);

-- 12. Who may call what.
revoke execute on function
  public.new_invite_code(),
  public.post_invites(uuid),
  public.invite_result(public.invites),
  public.expire_invites(),
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int),
  public.claim_invite(text),
  public.get_invite_preview(text)
from public, anon, authenticated;

grant execute on function
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int),
  public.claim_invite(text)
to authenticated;

grant execute on function public.get_invite_preview(text) to anon, authenticated;

notify pgrst, 'reload schema';
