-- Undo 20261008180000_prebuild_hardening: put back get_user_posts, notify_on_follow, claim_invite
-- and get_invite_preview as 20261008170000_private_accounts; notify_on_like as
-- 20260411173241_create_notifications_system (search path from 20261007150000); file_report as
-- 20261006100000_moderation. Drop invite_code_limit and the misses it counted.
begin;

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

  -- Closed by the owner's setting: say why, and show no padlock squares. Only the posts a tag ties
  -- the viewer to come back (usually none), so a notification can still open one; the
  -- viewer's feed lock still padlocks them.
  select * into v_owner from public.profiles where id = p_user;
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
  -- Otherwise only a ban or the viewer's own feed lock hides them: padlocks, as before.
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
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications(user_id, actor_id, type, post_id)
    VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;

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

-- The invite screen says when joining makes your follow a request.
create or replace function public.get_invite_preview(p_token text)
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
    'open', i.claimed_at is null and i.expires_at > now() and i.cancelled_at is null,
    'tag', c.id is not null and c.cancelled_at is null,
    'follow_request', i.challenge_id is null and i.post_id is null and p.is_private)
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and not p.is_banned
  left join public.tag_challenges c on c.id = i.challenge_id
  where i.token = p_token or lower(i.code) = lower(btrim(coalesce(p_token, '')));
$$;

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

drop function public.invite_code_limit(text);
delete from public.auth_rate_limits where action = 'invite_code_miss';

delete from supabase_migrations.schema_migrations where version = '20261008180000';

notify pgrst, 'reload schema';

commit;
