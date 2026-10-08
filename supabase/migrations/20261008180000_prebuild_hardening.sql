-- Pre-build review fixes (2026-10-08), four low findings checked by a second agent:
-- 1. get_user_posts: a banned person's profile answered other people with padlock squares that
--    still carried tagged people, answered tags and counts. Now nothing: {"locked": true, "items": []}.
--    (Staff read banned accounts in the staff portal, which doesn't use this.)
-- 2. notify_on_follow / notify_on_like: follow-unfollow or like-unlike loops sent a notice (and a
--    push) every time. Now one per recipient, sender and kind a day. The block, ban and approval
--    skips stay.
-- 3. get_invite_preview (callable signed out) and claim_invite take the 6-character code, which
--    could be guessed without limit. Now 20 unknown codes an hour per caller: the account when
--    signed in, else the address (Cloudflare's, else the last x-forwarded-for entry, the one the
--    proxy appends; the first is whatever the caller sent), counted in auth_rate_limits
--    (action 'invite_code_miss'). After that every code lookup is refused (22023 'too many tries,
--    try again later') until the hour is up. Full 32-character link tokens are not limited.
--    claim_invite answers null for an unknown code instead of an error, because an error would
--    roll the count back; the app only claims an invite its preview found.
-- 4. file_report: reporting a post or comment you can't see (can_view_post_id) answers
--    'that does not exist', the same as an unknown id, so it confirms nothing. Staff are exempt.
-- Previous definitions: get_user_posts, notify_on_follow, claim_invite, get_invite_preview from
-- 20261008170000_private_accounts; notify_on_like from 20260411173241_create_notifications_system
-- (search path from 20261007150000); file_report from 20261006100000_moderation.
-- Test: supabase/tests/prebuild_hardening_test.sql
-- Undo: supabase/rollbacks/20261008180000_prebuild_hardening.rollback.sql

-- 1. A banned person's posts.
create or replace function public.get_user_posts(
  p_user uuid,
  p_limit integer default 30,
  p_cursor_ts timestamp with time zone default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner public.profiles;
  v_hide boolean;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_uid <> p_user and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_user)
       or (b.blocker_id = p_user and b.blocked_id = v_uid)
  ) then
    return jsonb_build_object('locked', true, 'items', '[]'::jsonb);
  end if;

  select * into v_owner from public.profiles where id = p_user;
  -- Banned: nothing for anyone else, not even padlock squares (they carried tags and counts).
  if found and v_owner.is_banned and v_uid <> p_user then
    return jsonb_build_object('locked', true, 'items', '[]'::jsonb);
  end if;

  -- Closed by the owner's setting: say why, and show no padlock squares. Only the posts a tag ties
  -- the viewer to come back (usually none), so a notification can still open one; the
  -- viewer's feed lock still padlocks them.
  if found and not v_owner.is_banned and v_uid <> p_user
     and not public.posts_visibility_allows(v_uid, p_user) then
    v_hide := public.viewer_is_locked(v_uid);
    select coalesce(
             jsonb_agg(public.feed_item(s.p, v_uid, v_hide)
                       order by (s.p).created_at desc, (s.p).id desc),
             '[]'::jsonb)
    into v_items
    from (
      select p
      from public.posts p
      where p.user_id = p_user
        and p.hidden_at is null
        and public.tag_shows_post(v_uid, p.id)
        and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
      order by p.created_at desc, p.id desc
      limit least(greatest(coalesce(p_limit, 30), 1), 60)
    ) s;
    return jsonb_build_object(
      'locked', true,
      'restricted', case
        when v_owner.is_private and not exists (
          select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p_user
        ) then 'private'
        else public.effective_posts_visibility(p_user)
      end,
      'items', v_items);
  end if;
  -- Otherwise only the viewer's own feed lock hides them: padlocks, as before.
  v_hide := not public.can_view_post(v_uid, p_user);

  select coalesce(
           jsonb_agg(public.feed_item(s.p, v_uid, v_hide)
                     order by (s.p).created_at desc, (s.p).id desc),
           '[]'::jsonb)
  into v_items
  from (
    select p
    from public.posts p
    where p.user_id = p_user
      and p.hidden_at is null
      and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) s;

  return jsonb_build_object('locked', v_hide, 'items', v_items);
end;
$$;

-- 2. One follow notice and one like notice per pair a day.
-- No "started following you" for an approval (respond_follow_request, going public): the
-- requester asked, and the owner just said yes.
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('mahi.follow_approval', true), '') = 'on' then
    return new;
  end if;
  if new.following_id <> new.follower_id
     and not exists (select 1 from public.profiles where id = new.follower_id and is_banned)
     and not exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = new.follower_id and b.blocked_id = new.following_id)
          or (b.blocker_id = new.following_id and b.blocked_id = new.follower_id)
     )
     and not exists (
       select 1 from public.notifications n
       where n.user_id = new.following_id and n.actor_id = new.follower_id
         and n.type = 'follow' and n.created_at > now() - interval '24 hours'
     ) then
    insert into public.notifications (user_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_owner uuid;
begin
  select user_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id
     and not exists (
       select 1 from public.notifications n
       where n.user_id = post_owner and n.actor_id = new.user_id
         and n.type = 'like' and n.created_at > now() - interval '24 hours'
     ) then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (post_owner, new.user_id, 'like', new.post_id);
  end if;
  return new;
end;
$$;

-- 3. Invite code lookups: 20 misses an hour per caller.
-- Null for a full link token (never limited). For anything else, the caller's key, after
-- refusing when that key has missed 20 times in the last hour. The caller records a miss.
create function public.invite_code_limit(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_key text;
begin
  if coalesce(p_token, '') ~ '^[0-9a-f]{32}$' then
    return null;
  end if;
  v_key := case
    when auth.uid() is not null then 'user:' || auth.uid()::text
    else 'ip:' || coalesce(
      nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
      nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', -1)), ''),
      'unknown')
  end;
  -- One caller's tries one at a time, so a burst can't all slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('invite_code_miss:' || v_key, 0));
  delete from public.auth_rate_limits
  where ip = v_key and action = 'invite_code_miss' and created_at <= now() - interval '1 hour';
  if (select count(*) from public.auth_rate_limits
      where ip = v_key and action = 'invite_code_miss') >= 20 then
    raise exception 'too many tries, try again later' using errcode = '22023';
  end if;
  return v_key;
end;
$$;
revoke execute on function public.invite_code_limit(text) from public, anon, authenticated;

-- A tag invite (a slot on a post) makes both follows, as before. A general invite
-- ("invite a mate") from a private account: the inviter follows the claimer; the claimer's follow
-- is a request the inviter approves. The answer adds follow_status.
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
  v_follow text;
  v_key text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  select * into v_me from public.profiles where id = v_uid;
  if not found or v_me.is_banned then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_key := public.invite_code_limit(p_token);
  select * into v_inv from public.invites
  where token = p_token or lower(code) = lower(btrim(coalesce(p_token, '')))
  for update;
  if not found then
    -- An unknown code answers null, not an error: an error would roll the counted miss back.
    if v_key is not null then
      insert into public.auth_rate_limits (ip, action) values (v_key, 'invite_code_miss');
      return null;
    end if;
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  -- The same person claiming again gets the same answer, not a second tag.
  if v_inv.claimed_by = v_uid then
    return public.invite_result(v_inv) || jsonb_build_object('follow_status', case
      when exists (select 1 from public.follows f
                   where f.follower_id = v_uid and f.following_id = v_inv.inviter_id) then 'following'
      when exists (select 1 from public.follow_requests r
                   where r.requester_id = v_uid and r.target_id = v_inv.inviter_id) then 'requested'
      else 'none' end);
  end if;
  if v_inv.claimed_at is not null then
    raise exception 'that invite has been used' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() or v_inv.cancelled_at is not null then
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

  -- Shared lock: the inviter going public or private waits for this claim.
  select * into v_inviter from public.profiles where id = v_inv.inviter_id and not is_banned for share;
  if not found then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  -- The row is locked, so two people racing the same link: one wins here, the other saw
  -- claimed_at above or waits and then sees it.
  update public.invites set claimed_by = v_uid, claimed_at = now()
  where token = v_inv.token
  returning * into v_inv;

  if v_inv.challenge_id is null and v_inv.post_id is null and v_inviter.is_private
     and not exists (select 1 from public.follows f
                     where f.follower_id = v_uid and f.following_id = v_inv.inviter_id) then
    insert into public.follows (follower_id, following_id)
    values (v_inv.inviter_id, v_uid)
    on conflict do nothing;
    insert into public.follow_requests (requester_id, target_id)
    values (v_uid, v_inv.inviter_id)
    on conflict on constraint follow_requests_pair do nothing;
    v_follow := 'requested';
  else
    -- Friends both ways, so they can tag each other from here on.
    insert into public.follows (follower_id, following_id)
    values (v_uid, v_inv.inviter_id), (v_inv.inviter_id, v_uid)
    on conflict do nothing;
    delete from public.follow_requests r
    where (r.requester_id = v_uid and r.target_id = v_inv.inviter_id)
       or (r.requester_id = v_inv.inviter_id and r.target_id = v_uid);
    perform public.clear_follow_request_notice(v_uid, v_inv.inviter_id);
    perform public.clear_follow_request_notice(v_inv.inviter_id, v_uid);
    v_follow := 'following';
  end if;

  -- The slot gets its person. A slot taken back or dropped stays that way: friends, no tag.
  update public.tag_challenges
  set tagged_id = v_uid
  where id = v_inv.challenge_id
    and tagged_id is null and cancelled_at is null and answered_at is null
  returning * into v_c;
  if found then
    perform public.start_tag(v_c.id);
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id, follow_request)
  values (v_inv.inviter_id, v_uid, 'invite_joined', v_c.post_id, v_c.id, v_follow = 'requested');

  return public.invite_result(v_inv) || jsonb_build_object('follow_status', v_follow);
end;
$$;

-- The invite screen says when joining makes your follow a request. Now plpgsql and volatile: a
-- miss is written down.
create or replace function public.get_invite_preview(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_key text := public.invite_code_limit(p_token);
  v_preview jsonb;
begin
  select jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'open', i.claimed_at is null and i.expires_at > now() and i.cancelled_at is null,
    'tag', c.id is not null and c.cancelled_at is null,
    'follow_request', i.challenge_id is null and i.post_id is null and p.is_private)
  into v_preview
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and not p.is_banned
  left join public.tag_challenges c on c.id = i.challenge_id
  where i.token = p_token or lower(i.code) = lower(btrim(coalesce(p_token, '')));
  if v_preview is null and v_key is not null then
    insert into public.auth_rate_limits (ip, action) values (v_key, 'invite_code_miss');
  end if;
  return v_preview;
end;
$$;

-- 4. Reporting only what you can see.
create or replace function public.file_report(
  p_target_type text, p_target_id uuid, p_reason text, p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id uuid;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in (
    'spam', 'harassment', 'hate_speech', 'sexual_content', 'violence', 'self_harm', 'scam',
    'impersonation', 'underage', 'inappropriate_content', 'other') then
    raise exception 'unknown reason' using errcode = '22023';
  end if;
  if char_length(v_details) > 500 then
    raise exception 'details are at most 500 characters' using errcode = '22023';
  end if;

  v_owner := case p_target_type
    when 'user' then (select id from public.profiles where id = p_target_id)
    when 'post' then (select user_id from public.posts where id = p_target_id)
    when 'comment' then (select user_id from public.post_comments where id = p_target_id)
    when 'message' then (
      select m.sender_id from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = p_target_id and v_uid in (c.participant_one, c.participant_two))
  end;
  if v_owner is null then
    raise exception 'that does not exist' using errcode = '22023';
  end if;
  -- A post or comment you can't see: the same answer, so a report confirms nothing.
  if p_target_type in ('post', 'comment') and not public.is_staff()
     and not public.can_view_post_id(case p_target_type
           when 'post' then p_target_id
           else (select post_id from public.post_comments where id = p_target_id)
         end) then
    raise exception 'that does not exist' using errcode = '22023';
  end if;
  if v_owner = v_uid then
    raise exception 'you cannot report yourself' using errcode = '22023';
  end if;

  select id into v_id from public.user_reports
  where reporter_id = v_uid and target_type = p_target_type and target_id = p_target_id;
  if found then
    return jsonb_build_object('report_id', v_id, 'already_reported', true);
  end if;

  -- Enough for anyone acting in good faith; stops one account flooding the list.
  if (select count(*) from public.user_reports
      where reporter_id = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many reports today' using errcode = 'P0001';
  end if;

  insert into public.user_reports (reporter_id, reported_user_id, reported_post_id,
                                   reported_comment_id, reported_message_id, reason, description)
  values (v_uid,
          case when p_target_type = 'user' then p_target_id end,
          case when p_target_type = 'post' then p_target_id end,
          case when p_target_type = 'comment' then p_target_id end,
          case when p_target_type = 'message' then p_target_id end,
          p_reason, v_details)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then           -- a double tap racing itself
    select id into v_id from public.user_reports
    where reporter_id = v_uid and target_type = p_target_type and target_id = p_target_id;
    return jsonb_build_object('report_id', v_id, 'already_reported', true);
  end if;
  return jsonb_build_object('report_id', v_id, 'already_reported', false);
end;
$$;

notify pgrst, 'reload schema';
