-- Undo 20261008170000_private_accounts: every replaced function goes back to its definition
-- before it (as replayed from migrations through 20261008160000), the follows read rule goes back
-- to "anyone signed in", and the new functions, tables, profile columns and notification types go.
-- Requests still waiting are lost; follows made by approvals stay. Notices of the two new types are
-- deleted first so the old type check can come back.
begin;

-- 1. Lists.
drop policy follows_select on public.follows;
create policy follows_select on public.follows for select using (auth.role() = 'authenticated');

-- 2. Functions whose answers changed shape: drop, then the old ones.
drop function public.set_following(uuid, boolean);
drop function public.get_follow_data(uuid, uuid);
drop function public.search_tag_people(text, integer);
drop function public.match_contacts(text[]);

CREATE OR REPLACE FUNCTION public.get_follow_data(p_current_user_id uuid, p_target_user_id uuid)
 RETURNS TABLE(is_following boolean, follower_count bigint, following_count bigint, follows_you boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    case
      when p_current_user_id = p_target_user_id then false
      else exists (
        select 1 from public.follows
        where follower_id = p_current_user_id and following_id = p_target_user_id
      )
    end as is_following,
    (select count(*) from public.follows where following_id = p_target_user_id) as follower_count,
    (select count(*) from public.follows where follower_id = p_target_user_id) as following_count,
    case
      when p_current_user_id = p_target_user_id then false
      else exists (
        select 1 from public.follows
        where follower_id = p_target_user_id and following_id = p_current_user_id
      )
    end as follows_you;
$function$
;

CREATE OR REPLACE FUNCTION public.set_following(p_target_user_id uuid, p_following boolean)
 RETURNS TABLE(is_following boolean, follower_count bigint, following_count bigint, follows_you boolean, current_following_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'cannot follow that person' using errcode = '22023';
  end if;

  if p_following then
    if not exists (
      select 1 from public.profiles p
      where p.id = p_target_user_id and not p.is_banned
    ) or exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p_target_user_id)
         or (b.blocker_id = p_target_user_id and b.blocked_id = v_uid)
    ) then
      raise exception 'cannot follow that person' using errcode = '22023';
    end if;

    insert into public.follows (follower_id, following_id)
    values (v_uid, p_target_user_id)
    on conflict (follower_id, following_id) do nothing;
  else
    delete from public.follows
    where follower_id = v_uid and following_id = p_target_user_id;
  end if;

  return query
  select d.is_following, d.follower_count, d.following_count, d.follows_you,
         (select count(*) from public.follows f where f.follower_id = v_uid)
  from public.get_follow_data(v_uid, p_target_user_id) d;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_tag_people(p_query text DEFAULT ''::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_friend boolean, has_open_tag boolean, tagged_you boolean, points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.match_contacts(p_hashes text[])
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_following boolean, follows_you boolean, matched_hashes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  -- Serialises this person's tries, so two at once can't both slip under the limit.
  perform 1 from public.profiles pr where pr.id = v_uid and not pr.is_banned for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_hashes), 0) > v_cfg.contact_match_max_hashes then
    raise exception 'contact match: too many hashes' using errcode = '22023';
  end if;

  delete from public.contact_match_calls c
  where c.user_id = v_uid and c.called_at <= now() - interval '1 hour';
  if (select count(*) from public.contact_match_calls c where c.user_id = v_uid)
     >= v_cfg.contact_match_calls_per_hour then
    raise exception 'contact match: too many tries' using errcode = '22023';
  end if;
  insert into public.contact_match_calls (user_id) values (v_uid);

  return query
  with sent as (
    select distinct h from unnest(p_hashes) as t(h) where h ~ '^[0-9a-f]{64}$'
  ),
  hits as (
    select ch.user_id, array_agg(ch.hash order by ch.hash) as hashes
    from public.contact_hashes ch
    join sent on sent.h = ch.hash
    left join auth.users u on u.id = ch.user_id
    -- An email hash counts only while it is still that account's email.
    where ch.kind = 'phone'
       or public.contact_hash(lower(btrim(u.email))) = ch.hash
    group by ch.user_id
  )
  select p.id, p.username, p.display_name, p.avatar_url,
         exists (select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p.id),
         exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = v_uid),
         hits.hashes
  from hits
  join public.profiles p on p.id = hits.user_id and not p.is_banned
  where p.id <> v_uid
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = v_uid))
  order by p.username;
end;
$function$
;

revoke execute on function public.get_follow_data(uuid, uuid), public.set_following(uuid, boolean)
  from public, anon;
grant execute on function public.get_follow_data(uuid, uuid), public.set_following(uuid, boolean)
  to authenticated, service_role;
revoke execute on function public.search_tag_people(text, integer), public.match_contacts(text[])
  from public, anon;
grant execute on function public.search_tag_people(text, integer), public.match_contacts(text[])
  to authenticated, service_role;

-- 3. The rest, back to their previous bodies (create_post as 20261008140000).

CREATE OR REPLACE FUNCTION public.can_view_post(p_viewer uuid, p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_viewer = p_owner or (
    exists (select 1 from public.profiles where id = p_owner and not is_banned)
    and exists (
      select 1 from public.follows where follower_id = p_viewer and following_id = p_owner
    )
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_viewer and b.blocked_id = p_owner)
         or (b.blocker_id = p_owner and b.blocked_id = p_viewer)
    )
    and not public.viewer_is_locked(p_viewer)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_friends(p_user uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, username text, display_name text, first_name text, last_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.display_name, p.first_name, p.last_name, p.avatar_url
  from public.follows f
  join public.follows back
    on back.follower_id = f.following_id and back.following_id = p_user
  join public.profiles p on p.id = f.following_id and not p.is_banned
  where f.follower_id = p_user
    and auth.uid() is not null
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_user and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = p_user)
         or (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by p.username
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$function$
;

CREATE OR REPLACE FUNCTION public.get_feed(p_limit integer DEFAULT 20, p_cursor_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_locked boolean;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_locked := public.viewer_is_locked(v_uid);

  select coalesce(
           jsonb_agg(public.feed_item(s.p, v_uid, v_locked and (s.p).user_id <> v_uid)
                     order by (s.p).created_at desc, (s.p).id desc),
           '[]'::jsonb)
  into v_items
  from (
    select p
    from public.posts p
    join public.profiles pr on pr.id = p.user_id and not pr.is_banned
    where p.hidden_at is null
      and (
        p.user_id = v_uid
        or exists (
          select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p.user_id
        )
      )
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_uid)
      )
      and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) s;

  return jsonb_build_object(
    'locked', v_locked,
    'unlocked_until', public.viewer_unlocked_until(v_uid),
    'server_now', now(),
    'items', v_items
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_posts(p_user uuid, p_limit integer DEFAULT 30, p_cursor_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
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
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_follow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_suggested_follows(p_current_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, mutual_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_follow_count int;
begin
  -- The caller's suggestions only; the parameter stays for the apps that pass it.
  p_current_user_id := auth.uid();
  if p_current_user_id is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  select count(*)::int
  into v_follow_count
  from public.follows
  where follower_id = p_current_user_id;

  if v_follow_count >= 3 then
    return query
    select
      pr.id,
      pr.username,
      pr.display_name,
      pr.avatar_url,
      count(distinct f1.following_id)::bigint as mutual_count
    from public.follows f1
    join public.follows f2
      on f2.follower_id = f1.following_id
    join public.profiles pr
      on pr.id = f2.following_id
    where
      f1.follower_id = p_current_user_id
      and f2.following_id <> p_current_user_id
      and not exists (
        select 1 from public.follows af
        where af.follower_id = p_current_user_id
          and af.following_id = f2.following_id
      )
      and not exists (
        select 1 from public.user_blocks ub
        where ub.blocker_id = p_current_user_id
          and ub.blocked_id = f2.following_id
      )
      and not exists (
        select 1 from public.user_blocks ub
        where ub.blocker_id = f2.following_id
          and ub.blocked_id = p_current_user_id
      )
    group by pr.id, pr.username, pr.display_name, pr.avatar_url
    order by mutual_count desc, pr.id asc
    limit p_limit offset p_offset;

  else
    return query
    select
      pr.id,
      pr.username,
      pr.display_name,
      pr.avatar_url,
      count(fol.follower_id)::bigint as mutual_count
    from public.profiles pr
    left join public.follows fol
      on fol.following_id = pr.id
    where
      pr.id <> p_current_user_id
      and not exists (
        select 1 from public.follows af
        where af.follower_id = p_current_user_id
          and af.following_id = pr.id
      )
      and not exists (
        select 1 from public.user_blocks ub
        where ub.blocker_id = p_current_user_id
          and ub.blocked_id = pr.id
      )
      and not exists (
        select 1 from public.user_blocks ub
        where ub.blocker_id = pr.id
          and ub.blocked_id = p_current_user_id
      )
    group by pr.id, pr.username, pr.display_name, pr.avatar_url
    order by mutual_count desc, pr.id asc
    limit p_limit offset p_offset;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_to_tag(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.respond_tag_invite(p_challenge uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.claim_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_block()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Remove follows in both directions
  delete from public.follows
  where (follower_id = NEW.blocker_id and following_id = NEW.blocked_id)
     or (follower_id = NEW.blocked_id and following_id = NEW.blocker_id);

  -- Save current status, then mark as blocked
  update public.conversations
  set pre_block_status = status,
      status = 'blocked'
  where status != 'blocked'
    and participant_one = LEAST(NEW.blocker_id, NEW.blocked_id)
    and participant_two = GREATEST(NEW.blocker_id, NEW.blocked_id);

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sanction_user(p_kind text, p_user_id uuid, p_reason text, p_ends_at timestamp with time zone, p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n int;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'that person does not exist' using errcode = '22023';
  end if;
  if public.staff_role(p_user_id) is not null and p_kind <> 'warning' then
    raise exception 'staff cannot be suspended or banned here' using errcode = '22023';
  end if;
  insert into public.user_sanctions (user_id, kind, reason, report_id, created_by, ends_at)
  values (p_user_id, p_kind, p_reason, p_report_id, auth.uid(), p_ends_at);
  if p_kind in ('suspension', 'ban') then
    update public.profiles set is_banned = true where id = p_user_id;
    -- Sign them out everywhere.
    delete from auth.refresh_tokens where user_id = p_user_id::text;
    delete from auth.sessions where user_id = p_user_id;
  end if;
  v_n := public.close_reports('user', p_user_id, 'actioned', p_reason, p_report_id);
  perform public.log_moderation_action(
    case p_kind when 'warning' then 'warn_user' when 'suspension' then 'suspend_user' else 'ban_user' end,
    'user', p_user_id, p_report_id, p_reason,
    case when p_ends_at is not null then jsonb_build_object('ends_at', p_ends_at) else '{}'::jsonb end);
  return jsonb_build_object('ok', true, 'reports_closed', v_n);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor text;
  v_c public.tag_challenges;
begin
  select '@' || username into v_actor from public.profiles where id = new.actor_id;

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
      when 'tag_missed' then v_actor || ' missed your tag. A quick message could get them back to it.'
      when 'invite_joined' then
        v_actor || ' joined Mahi from your invite. You follow each other now.'
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your points are back to 0.'
      when 'tag_invite' then v_actor || ' wants to tag you. Accept to follow each other.'
      when 'tag_invite_accepted' then
        v_actor || ' accepted your tag request. You follow each other now.'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'open', i.claimed_at is null and i.expires_at > now() and i.cancelled_at is null,
    'tag', c.id is not null and c.cancelled_at is null)
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and not p.is_banned
  left join public.tag_challenges c on c.id = i.challenge_id
  where i.token = p_token or lower(i.code) = lower(btrim(coalesce(p_token, '')));
$function$
;

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
  -- The first workout may tag nobody (2026-10-08). Otherwise: once
  -- invite links are switched on, an empty slot can always be filled by an invite, so every post
  -- carries the full three. Until then, having too few friends still excuses the difference.
  v_required := case
    when v_first_post then 0
    when not v_cfg.tags_required then 0
    when v_cfg.invite_links_enabled then v_cfg.tag_count
    else least(v_cfg.tag_count, v_available)
  end;
  if cardinality(v_tags) + v_invites + cardinality(v_slots) < v_required
     or cardinality(v_tags) + v_invites + cardinality(v_slots) > greatest(v_cfg.tag_count, 1) then
    raise exception 'tag or invite % people', v_required
      using errcode = '22023', detail = json_build_object('required', v_required)::text;
  end if;
  -- Existing friends and people not on Mahi are equal choices. A waiting invite may fill any slot;
  -- nobody needs to unfollow a friend to make the invite option available.
  if exists (
    select 1 from unnest(v_tags) t(id)
    where t.id not in (select f.id from public.taggable_friends(v_uid) f where not f.has_open_tag)
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


-- Posts read rule, and the two per-post checks, back to the owner rule only.
drop policy posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_staff()
    or (hidden_at is null and public.can_view_posts_of(user_id))
  );

CREATE OR REPLACE FUNCTION public.can_view_post_id(p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and (p.user_id = auth.uid() or (p.hidden_at is null and public.can_view_posts_of(p.user_id)))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_post_object(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select split_part(p_name, '/', 1) = auth.uid()::text
      or public.is_staff()
      or exists (
        select 1 from public.posts p
        where (p.image_path = p_name or p.pov_image_path = p_name)
          and p.hidden_at is null
          and public.can_view_post(auth.uid(), p.user_id)
      );
$function$
;

-- 4. New functions.
drop function public.can_view_post_for(uuid, uuid, uuid);
drop function public.tagged_on_post(uuid, uuid);
drop function public.respond_follow_request(uuid, boolean, boolean);
drop function public.remove_follower(uuid);
drop function public.get_follow_requests();
drop function public.set_account_controls(boolean, text, text);
drop function public.can_see_follow_lists(uuid);
drop function public.posts_visibility_allows(uuid, uuid);
drop function public.effective_posts_visibility(uuid);
drop function public.tag_mode(uuid, uuid);
drop function public.clear_follow_request_notice(uuid, uuid);

-- 5. Notices of the new types, then the old type check.
delete from public.notifications where type in ('follow_request', 'follow_accepted');
alter table public.notifications drop column follow_request;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag', 'tag_answered', 'tag_missed', 'invite_joined',
                  'streak_lost', 'tag_invite', 'tag_invite_accepted'));

-- 6. Tables and columns.
alter publication supabase_realtime drop table public.follow_requests;
drop table public.follow_requests;
drop table public.follow_request_notices;
alter table public.profiles
  drop column is_private,
  drop column posts_visibility,
  drop column tag_permission,
  drop column privacy_chosen_at;

delete from supabase_migrations.schema_migrations where version = '20261008170000';

notify pgrst, 'reload schema';

commit;
