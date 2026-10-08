-- Public and private accounts, and Controls (owner, 2026-10-08; plan .claude/plan-private-accounts.md).
-- 1. profiles: is_private, posts_visibility ('everyone' | 'followers' | 'friends'), tag_permission
--    ('everyone' | 'approve' | 'friends'), privacy_chosen_at (null until chosen on onboarding; every
--    existing profile is stamped now, stays public and skips that screen). Workouts start at
--    'followers' for every existing and new profile (owner, D1: this push opens nobody up; only
--    followers saw workouts before it); choosing Public with everyone sends 'everyone'. No update
--    grant: they change only through set_account_controls. Private + 'everyone' counts as 'followers'.
-- 2. follow_requests: a follow to a private account waits here until the owner confirms or deletes
--    it. Read by the two people only; written only by the functions below. follow_request_notices
--    remembers the last new request per pair (one push per pair a day; 100 new requests a day).
-- 3. set_following answers status ('following' | 'requested' | 'none') and is_private;
--    respond_follow_request, remove_follower, get_follow_requests, set_account_controls are new;
--    get_follow_data answers only for the caller (the passed id is ignored) and adds requested and
--    is_private. No "started following you" notice for an approval (mahi.follow_approval).
-- 4. Visibility: can_view_post = owner, or (not banned, no block, feed not locked, and the owner's
--    workouts setting lets the viewer in). Posts, files, likes, comments and comment likes follow it.
--    get_feed keeps to followed accounts within the same setting; get_user_posts says why a profile
--    is closed (restricted) instead of padlocks, unless the viewer's feed lock is the reason.
--    A person tagged on a post (post_tags, or a started tag on it), and the tagger of a tag a post
--    answers (tag_challenges.answered_post_id), always see THAT post, its photo, comments and
--    likes, and can like and comment (owner, 2026-10-08); blocks, bans and the feed lock still win,
--    and the poster's other posts stay closed (tag_shows_post + can_view_post_for, used by
--    can_view_post_id, can_view_post_object, posts_select and get_user_posts).
--    Follower and following lists (follows_select, get_friends) follow the owner's setting too: a
--    follows row shows to someone outside it only when BOTH people's lists are open to them, so a
--    public account's following list can't reveal who follows a private account.
-- 5. Tags: create_post tags a non-friend straight away only when they take tags from everyone;
--    invite_to_tag is refused to friends-only people; accepting a tag request no longer makes
--    follows and says who follows whom; search_tag_people and match_contacts say tag_mode.
-- 6. Invites: a tag invite on a post makes both follows (as before); a general invite from a private
--    account makes the claimer's follow a request (the inviter still follows the claimer).
-- 7. Notices: follow_request, follow_accepted; notifications.follow_request (an invite_joined whose
--    claimer's follow is a request); push words for them; tag request words without the
--    follow promise; the missed-tag push matches the app. Blocks and bans clear requests.
-- Test: supabase/tests/private_accounts_test.sql, supabase/tests/controls_test.sql,
--       supabase/tests/tagged_post_visibility_test.sql
-- Undo: supabase/rollbacks/20261008170000_private_accounts.rollback.sql

-- 1. Profile columns.
alter table public.profiles
  add column is_private boolean not null default false,
  -- Every existing row gets 'followers' from the default (owner, D1).
  add column posts_visibility text not null default 'followers'
    constraint profiles_posts_visibility_check
    check (posts_visibility in ('everyone', 'followers', 'friends')),
  add column tag_permission text not null default 'approve'
    constraint profiles_tag_permission_check
    check (tag_permission in ('everyone', 'approve', 'friends')),
  -- Filled for every existing row without an update (no updated_at churn), then no default.
  add column privacy_chosen_at timestamptz default now();
alter table public.profiles alter column privacy_chosen_at drop default;

-- 2. Requests.
-- The key is a random id: a live (realtime) delete carries only the key to every listener, so it
-- must not name who asked whom.
create table public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follow_requests_pair unique (requester_id, target_id),
  constraint follow_requests_not_self check (requester_id <> target_id)
);
create index follow_requests_target_idx on public.follow_requests (target_id, created_at desc);
alter table public.follow_requests enable row level security;
revoke all on public.follow_requests from anon, authenticated;
grant select on public.follow_requests to authenticated;
create policy follow_requests_select_own on public.follow_requests
  for select to authenticated
  using ((select auth.uid()) in (requester_id, target_id));
alter publication supabase_realtime add table public.follow_requests;

create table public.follow_request_notices (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (requester_id, target_id)
);
alter table public.follow_request_notices enable row level security;
revoke all on public.follow_request_notices from anon, authenticated;

-- True on an invite_joined notice when the claimer's follow is a request waiting for the inviter
-- (claim_invite); null on every other notice. Readable by the recipient like the rest of the row.
alter table public.notifications add column follow_request boolean;
-- Your own notices: only is_read may change (the app marks read; nothing else is written).
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag', 'tag_answered', 'tag_missed', 'invite_joined',
                  'streak_lost', 'tag_invite', 'tag_invite_accepted', 'follow_request',
                  'follow_accepted'));

-- 3. Internal helpers.
create function public.effective_posts_visibility(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when p.is_private and p.posts_visibility = 'everyone' then 'followers'
              else p.posts_visibility end
  from public.profiles p
  where p.id = p_owner;
$$;

-- Whether the owner's workouts setting lets the viewer in (no feed lock, ban or block here).
create function public.posts_visibility_allows(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer is not null and (
    p_viewer = p_owner
    or coalesce(case public.effective_posts_visibility(p_owner)
      when 'everyone' then true
      when 'followers' then exists (
        select 1 from public.follows f where f.follower_id = p_viewer and f.following_id = p_owner)
      when 'friends' then public.are_friends(p_viewer, p_owner)
    end, false)
  );
$$;

-- How a tag from the tagger would reach the target: straight away, as a request, or not at all.
create function public.tag_mode(p_tagger uuid, p_target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when pr.id is null or pr.is_banned or p_tagger is null or p_tagger = p_target
      or exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_tagger and b.blocked_id = p_target)
           or (b.blocker_id = p_target and b.blocked_id = p_tagger)) then 'none'
    when public.are_friends(p_tagger, p_target) then 'direct'
    when pr.tag_permission = 'everyone' then 'direct'
    when pr.tag_permission = 'approve' then 'request'
    else 'none'
  end
  from (select 1) one
  left join public.profiles pr on pr.id = p_target;
$$;

-- Removes the "wants to follow you" notice(s) for a target (from one requester, or all when null)
-- and their pushes not yet sent.
create function public.clear_follow_request_notice(p_requester uuid, p_target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.notifications n
    where n.user_id = p_target and n.type = 'follow_request'
      and (p_requester is null or n.actor_id = p_requester)
    returning n.id
  )
  delete from public.push_outbox o
  using gone g
  where o.dedupe_key = 'notification:' || g.id and o.sent_at is null and o.claimed_at is null;
$$;

revoke execute on function public.effective_posts_visibility(uuid),
  public.posts_visibility_allows(uuid, uuid), public.tag_mode(uuid, uuid),
  public.clear_follow_request_notice(uuid, uuid)
  from public, anon, authenticated;

-- 4. Visibility.
create or replace function public.can_view_post(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer is not null and (
    p_viewer = p_owner or (
      exists (select 1 from public.profiles where id = p_owner and not is_banned)
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_viewer and b.blocked_id = p_owner)
           or (b.blocker_id = p_owner and b.blocked_id = p_viewer)
      )
      and not public.viewer_is_locked(p_viewer)
      and public.posts_visibility_allows(p_viewer, p_owner)
    )
  );
$$;

-- Whether a tag ties the viewer to this post: they are tagged on it (its tag bubble in post_tags,
-- or a started tag on it: a slot whose 48 hours are running), or they tagged the person whose post
-- this is and this post answers that tag.
create function public.tag_shows_post(p_viewer uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.post_tags pt where pt.post_id = p_post_id and pt.user_id = p_viewer)
      or exists (
           select 1 from public.tag_challenges c
           where c.post_id = p_post_id and c.tagged_id = p_viewer and c.expires_at is not null)
      or exists (
           select 1 from public.tag_challenges c
           where c.answered_post_id = p_post_id and c.tagger_id = p_viewer);
$$;

-- One post: the owner's rule (can_view_post), or a tag ties the viewer to this post. The tag
-- exception skips only the workouts setting: a block either way, a banned owner or the viewer's
-- feed lock still keep it shut.
create function public.can_view_post_for(p_viewer uuid, p_owner uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_post(p_viewer, p_owner) or (
    p_viewer is not null
    and public.tag_shows_post(p_viewer, p_post_id)
    and exists (select 1 from public.profiles where id = p_owner and not is_banned)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_viewer and b.blocked_id = p_owner)
         or (b.blocker_id = p_owner and b.blocked_id = p_viewer)
    )
    and not public.viewer_is_locked(p_viewer)
  );
$$;
revoke execute on function public.tag_shows_post(uuid, uuid), public.can_view_post_for(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.can_view_post_id(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and auth.uid() is not null
      and (p.user_id = auth.uid()
           or (p.hidden_at is null and public.can_view_post_for(auth.uid(), p.user_id, p.id)))
  );
$$;

create or replace function public.can_view_post_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(p_name, '/', 1) = auth.uid()::text
      or public.is_staff()
      or exists (
        select 1 from public.posts p
        where (p.image_path = p_name or p.pov_image_path = p_name)
          and p.hidden_at is null
          and public.can_view_post_for(auth.uid(), p.user_id, p.id)
      );
$$;

drop policy posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_staff()
    or (hidden_at is null and public.can_view_post_id(id))
  );

-- Whether the caller may read the owner's follower and following lists: the owner, or anyone the
-- owner's workouts setting lets in (feed lock aside) with no block. Reads follows as its owner, so
-- the follows policy below never reads follows itself.
create function public.can_see_follow_lists(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    p_owner = auth.uid() or (
      not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p_owner)
           or (b.blocker_id = p_owner and b.blocked_id = auth.uid())
      )
      and public.posts_visibility_allows(auth.uid(), p_owner)
    )
  );
$$;
revoke execute on function public.can_see_follow_lists(uuid) from public, anon;
grant execute on function public.can_see_follow_lists(uuid) to authenticated;

-- A row is one person's follower and the other's following, so a stranger sees it only when both
-- lists are open to them: a public account's following list can't reveal a private account's
-- followers. You always see the rows you are part of.
drop policy follows_select on public.follows;
create policy follows_select on public.follows
  for select to authenticated
  using (
    follower_id = (select auth.uid())
    or following_id = (select auth.uid())
    or (public.can_see_follow_lists(following_id) and public.can_see_follow_lists(follower_id))
  );

create or replace function public.get_friends(p_user uuid, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, username text, display_name text, first_name text, last_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.first_name, p.last_name, p.avatar_url
  from public.follows f
  join public.follows back
    on back.follower_id = f.following_id and back.following_id = p_user
  join public.profiles p on p.id = f.following_id and not p.is_banned
  where f.follower_id = p_user
    and auth.uid() is not null
    and public.can_see_follow_lists(p_user)
    and (p.id = auth.uid() or public.can_see_follow_lists(p.id))
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
$$;

create or replace function public.get_feed(
  p_limit integer default 20,
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
        or (
          exists (
            select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p.user_id
          )
          -- The owner's workouts setting (friends-only drops one-way followers); a locked feed
          -- still shows padlocks, as before.
          and public.posts_visibility_allows(v_uid, p.user_id)
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
$$;

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

-- 5. Follows and requests.
drop function public.set_following(uuid, boolean);
drop function public.get_follow_data(uuid, uuid);

-- p_current_user_id stays for apps already on phones; the answer is always the caller's.
create function public.get_follow_data(p_current_user_id uuid, p_target_user_id uuid)
returns table (
  is_following boolean,
  follower_count bigint,
  following_count bigint,
  follows_you boolean,
  requested boolean,
  is_private boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
  select
    v_uid <> p_target_user_id and exists (
      select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p_target_user_id),
    (select count(*) from public.follows f where f.following_id = p_target_user_id),
    (select count(*) from public.follows f where f.follower_id = p_target_user_id),
    v_uid <> p_target_user_id and exists (
      select 1 from public.follows f where f.follower_id = p_target_user_id and f.following_id = v_uid),
    exists (
      select 1 from public.follow_requests r
      where r.requester_id = v_uid and r.target_id = p_target_user_id),
    coalesce((select pr.is_private from public.profiles pr where pr.id = p_target_user_id), false);
end;
$$;

create function public.set_following(p_target_user_id uuid, p_following boolean)
returns table (
  is_following boolean,
  follower_count bigint,
  following_count bigint,
  follows_you boolean,
  current_following_count bigint,
  status text,
  is_private boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'cannot follow that person' using errcode = '22023';
  end if;

  -- Shared lock: going public or private waits for this, and this waits for it.
  select * into v_target from public.profiles pr where pr.id = p_target_user_id for share;

  if p_following then
    if not found or v_target.is_banned or exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p_target_user_id)
         or (b.blocker_id = p_target_user_id and b.blocked_id = v_uid)
    ) then
      raise exception 'cannot follow that person' using errcode = '22023';
    end if;

    if exists (select 1 from public.follows f
               where f.follower_id = v_uid and f.following_id = p_target_user_id) then
      null;
    elsif v_target.is_private then
      if not exists (select 1 from public.follow_requests r
                     where r.requester_id = v_uid and r.target_id = p_target_user_id) then
        -- 100 new requests a day; the same pair asked again the same day doesn't count twice.
        if not exists (
             select 1 from public.follow_request_notices n
             where n.requester_id = v_uid and n.target_id = p_target_user_id
               and n.notified_at > now() - interval '1 day')
           and (select count(*) from public.follow_request_notices n
                where n.requester_id = v_uid and n.notified_at > now() - interval '1 day') >= 100 then
          raise exception 'too many follow requests today' using errcode = '22023';
        end if;
        insert into public.follow_requests (requester_id, target_id)
        values (v_uid, p_target_user_id)
        on conflict on constraint follow_requests_pair do nothing;
        get diagnostics v_rows = row_count;
        if v_rows > 0 then
          -- One "wants to follow you" per pair a day.
          insert into public.follow_request_notices (requester_id, target_id, notified_at)
          values (v_uid, p_target_user_id, now())
          on conflict (requester_id, target_id) do update set notified_at = excluded.notified_at
            where public.follow_request_notices.notified_at <= now() - interval '1 day';
          get diagnostics v_rows = row_count;
          if v_rows > 0 then
            insert into public.notifications (user_id, actor_id, type)
            values (p_target_user_id, v_uid, 'follow_request');
          end if;
        end if;
      end if;
    else
      insert into public.follows (follower_id, following_id)
      values (v_uid, p_target_user_id)
      on conflict (follower_id, following_id) do nothing;
    end if;
  else
    delete from public.follows f
    where f.follower_id = v_uid and f.following_id = p_target_user_id;
    delete from public.follow_requests r
    where r.requester_id = v_uid and r.target_id = p_target_user_id;
    perform public.clear_follow_request_notice(v_uid, p_target_user_id);
  end if;

  return query
  select d.is_following, d.follower_count, d.following_count, d.follows_you,
         (select count(*) from public.follows f where f.follower_id = v_uid),
         case when d.is_following then 'following' when d.requested then 'requested' else 'none' end,
         d.is_private
  from public.get_follow_data(v_uid, p_target_user_id) d;
end;
$$;

-- The target answers a request. Accepting re-checks bans and blocks; deleting tells nobody.
create function public.respond_follow_request(
  p_requester uuid,
  p_accept boolean,
  p_follow_back boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_had boolean;
  v_ok boolean;
  v_status text;
  v_back text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from public.follow_requests r
  where r.requester_id = p_requester and r.target_id = v_uid;
  v_had := found;
  perform public.clear_follow_request_notice(p_requester, v_uid);

  v_ok := exists (select 1 from public.profiles pr where pr.id = p_requester and not pr.is_banned)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p_requester)
         or (b.blocker_id = p_requester and b.blocked_id = v_uid));

  if not v_had then
    -- Already answered (a second tap) or cancelled.
    v_status := case
      when coalesce(p_accept, false) and exists (
        select 1 from public.follows f where f.follower_id = p_requester and f.following_id = v_uid)
      then 'accepted' else 'gone' end;
  elsif not coalesce(p_accept, false) then
    v_status := 'declined';
  elsif not v_ok then
    v_status := 'gone';
  else
    perform set_config('mahi.follow_approval', 'on', true);
    insert into public.follows (follower_id, following_id)
    values (p_requester, v_uid)
    on conflict do nothing;
    perform set_config('mahi.follow_approval', '', true);
    insert into public.notifications (user_id, actor_id, type)
    values (p_requester, v_uid, 'follow_accepted');
    v_status := 'accepted';
  end if;

  -- Follow back only goes with an accepted request.
  if coalesce(p_follow_back, false) and v_status = 'accepted' then
    v_back := 'none';
    if v_ok and p_requester <> v_uid then
      begin
        select s.status into v_back from public.set_following(p_requester, true) s;
      exception when sqlstate '22023' then
        v_back := 'none';
      end;
    end if;
  end if;

  return jsonb_build_object('status', v_status, 'follow_back', v_back);
end;
$$;

-- Removes someone who follows you, without telling them. If you were friends, the open tags
-- between you end too (as a block does).
create function public.remove_follower(p_follower uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_friends boolean;
  v_removed boolean;
  v_ended int := 0;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_friends := public.are_friends(v_uid, p_follower);

  delete from public.follows f where f.follower_id = p_follower and f.following_id = v_uid;
  v_removed := found;

  if v_removed and v_friends then
    with cancelled as (
      update public.tag_challenges
      set cancelled_at = now()
      where answered_at is null and cancelled_at is null and missed_at is null
        and ((tagger_id = v_uid and tagged_id = p_follower)
          or (tagger_id = p_follower and tagged_id = v_uid))
      returning id
    ), unsent as (
      delete from public.push_outbox o using cancelled c
      where o.challenge_id = c.id and o.sent_at is null
    )
    select count(*)::int into v_ended from cancelled;
  end if;

  return jsonb_build_object('removed', v_removed, 'tags_ended', v_ended);
end;
$$;

create function public.get_follow_requests()
returns table (
  requester_id uuid,
  username text,
  display_name text,
  avatar_url text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
  select r.requester_id, p.username, p.display_name, p.avatar_url, r.created_at
  from public.follow_requests r
  join public.profiles p on p.id = r.requester_id and not p.is_banned
  where r.target_id = auth.uid()
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = r.requester_id)
         or (b.blocker_id = r.requester_id and b.blocked_id = auth.uid()))
  order by r.created_at desc, r.requester_id;
end;
$$;

-- Settings → Controls and the onboarding choice. Null = unchanged.
create function public.set_account_controls(
  p_is_private boolean default null,
  p_posts_visibility text default null,
  p_tag_permission text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_private boolean;
  v_vis text;
  v_tags text;
  v_accepted int := 0;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (p_posts_visibility is not null and p_posts_visibility not in ('everyone', 'followers', 'friends'))
     or (p_tag_permission is not null and p_tag_permission not in ('everyone', 'approve', 'friends')) then
    raise exception 'that setting is not allowed' using errcode = '22023';
  end if;

  -- Locked, so a follow racing this waits for it (set_following reads this row for share).
  select * into v_me from public.profiles where id = v_uid for update;
  if not found or v_me.is_banned then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_private := coalesce(p_is_private, v_me.is_private);
  v_vis := coalesce(p_posts_visibility, v_me.posts_visibility);
  if v_private and v_vis = 'everyone' then
    v_vis := 'followers';
  end if;
  v_tags := coalesce(p_tag_permission, v_me.tag_permission);

  update public.profiles
  set is_private = v_private,
      posts_visibility = v_vis,
      tag_permission = v_tags,
      privacy_chosen_at = coalesce(privacy_chosen_at, now())
  where id = v_uid;

  -- Public: every pending request is accepted in one statement (going private keeps followers).
  if not v_private then
    perform set_config('mahi.follow_approval', 'on', true);
    with gone as (
      delete from public.follow_requests r where r.target_id = v_uid
      returning r.requester_id
    ), ok as (
      select g.requester_id
      from gone g
      join public.profiles p on p.id = g.requester_id and not p.is_banned
      where not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = g.requester_id)
           or (b.blocker_id = g.requester_id and b.blocked_id = v_uid))
    ), added as (
      insert into public.follows (follower_id, following_id)
      select ok.requester_id, v_uid from ok
      on conflict do nothing
      returning 1
    ), told as (
      insert into public.notifications (user_id, actor_id, type)
      select ok.requester_id, v_uid, 'follow_accepted' from ok
      returning 1
    )
    select count(*)::int into v_accepted from ok;
    perform set_config('mahi.follow_approval', '', true);
    perform public.clear_follow_request_notice(null, v_uid);
  end if;

  return jsonb_build_object(
    'is_private', v_private,
    'posts_visibility', v_vis,
    'tag_permission', v_tags,
    'accepted_requests', v_accepted);
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

drop function public.get_suggested_follows(uuid, integer, integer);
create function public.get_suggested_follows(
  p_current_user_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  mutual_count bigint,
  is_private boolean,
  requested boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
      count(distinct f1.following_id)::bigint as mutual_count,
      pr.is_private,
      false
    from public.follows f1
    join public.follows f2
      on f2.follower_id = f1.following_id
    join public.profiles pr
      on pr.id = f2.following_id
    where
      f1.follower_id = p_current_user_id
      and f2.following_id <> p_current_user_id
      and not pr.is_banned
      -- Only follows the caller may see count (the follows rule: both people's lists open), so a
      -- closed list never shows up as a number or a suggestion.
      and public.can_see_follow_lists(f1.following_id)
      and public.can_see_follow_lists(f2.following_id)
      and not exists (
        select 1 from public.follows af
        where af.follower_id = p_current_user_id
          and af.following_id = f2.following_id
      )
      and not exists (
        select 1 from public.follow_requests fr
        where fr.requester_id = p_current_user_id
          and fr.target_id = f2.following_id
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
    group by pr.id, pr.username, pr.display_name, pr.avatar_url, pr.is_private
    order by mutual_count desc, pr.id asc
    limit p_limit offset p_offset;

  else
    return query
    select
      pr.id,
      pr.username,
      pr.display_name,
      pr.avatar_url,
      count(fol.follower_id)::bigint as mutual_count,
      pr.is_private,
      false
    from public.profiles pr
    left join public.follows fol
      on fol.following_id = pr.id
      -- Only followers the caller may see count.
      and public.can_see_follow_lists(fol.follower_id)
      and public.can_see_follow_lists(pr.id)
    where
      pr.id <> p_current_user_id
      and not pr.is_banned
      and not exists (
        select 1 from public.follows af
        where af.follower_id = p_current_user_id
          and af.following_id = pr.id
      )
      and not exists (
        select 1 from public.follow_requests fr
        where fr.requester_id = p_current_user_id
          and fr.target_id = pr.id
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
    group by pr.id, pr.username, pr.display_name, pr.avatar_url, pr.is_private
    order by mutual_count desc, pr.id asc
    limit p_limit offset p_offset;
  end if;
end;
$$;
revoke execute on function public.get_suggested_follows(uuid, integer, integer) from public, anon;
grant execute on function public.get_suggested_follows(uuid, integer, integer) to authenticated, service_role;

-- 6. Tags.
drop function public.search_tag_people(text, integer);
create function public.search_tag_people(p_query text default '', p_limit integer default 50)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_friend boolean,
  has_open_tag boolean,
  tagged_you boolean,
  points integer,
  is_private boolean,
  requested boolean,
  tag_mode text
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
         p.streak_current,
         p.is_private,
         exists (
           select 1 from public.follow_requests r
           where r.requester_id = auth.uid() and r.target_id = p.id
         ),
         public.tag_mode(auth.uid(), p.id)
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
revoke execute on function public.search_tag_people(text, integer) from public, anon;
grant execute on function public.search_tag_people(text, integer) to authenticated, service_role;

-- create_post as 20261008140000_first_workout_no_tags; only the direct-tag rule changes: a friend
-- (taggable_friends) as before, or anyone who takes tags from everyone (not banned, no block, no
-- open tag from you).
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

create or replace function public.invite_to_tag(p_user uuid)
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
  -- Controls: someone who takes tags only from friends gets no requests from anyone else.
  if exists (select 1 from public.profiles where id = p_user and tag_permission = 'friends') then
    raise exception 'only takes tags from friends' using errcode = '22023';
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

-- Accepting a tag request starts the tag but no longer makes follows (owner, 2026-10-08): the
-- answer says who follows whom and whether the tagger asked to follow, so the app can offer
-- Follow back / Accept their follow.
create or replace function public.respond_tag_invite(p_challenge uuid, p_accept boolean)
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

  if found and p_accept and v_c.accepted_at is not null and v_c.cancelled_at is null then
    -- Pressing Accept twice gives the same answer.
    null;
  elsif not found
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
  elsif not p_accept then
    update public.tag_challenges set declined_at = now(), cancelled_at = now() where id = v_c.id;
    return jsonb_build_object('accepted', false);
  else
    update public.tag_challenges set accepted_at = now() where id = v_c.id;
    perform public.start_tag(v_c.id);
    insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
    values (v_c.tagger_id, v_uid, 'tag_invite_accepted', v_c.post_id, v_c.id);
  end if;

  return jsonb_build_object(
    'accepted', true,
    'you_follow_them', exists (
      select 1 from public.follows f where f.follower_id = v_uid and f.following_id = v_c.tagger_id),
    'they_follow_you', exists (
      select 1 from public.follows f where f.follower_id = v_c.tagger_id and f.following_id = v_uid),
    'their_follow_request', exists (
      select 1 from public.follow_requests r
      where r.requester_id = v_c.tagger_id and r.target_id = v_uid));
end;
$$;

-- 7. Invites. A tag invite (a slot on a post) makes both follows, as before. A general invite
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

-- 8. Contacts: the same follow and tag answers as search.
drop function public.match_contacts(text[]);
create function public.match_contacts(p_hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_following boolean,
  follows_you boolean,
  matched_hashes text[],
  is_private boolean,
  requested boolean,
  tag_mode text
)
language plpgsql
security definer
set search_path = public
as $$
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
         hits.hashes,
         p.is_private,
         exists (select 1 from public.follow_requests r
                 where r.requester_id = v_uid and r.target_id = p.id),
         public.tag_mode(v_uid, p.id)
  from hits
  join public.profiles p on p.id = hits.user_id and not p.is_banned
  where p.id <> v_uid
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = v_uid))
  order by p.username;
end;
$$;
revoke execute on function public.match_contacts(text[]) from public, anon;
grant execute on function public.match_contacts(text[]) to authenticated, service_role;

-- 9. Blocks and bans clear requests.
create or replace function public.handle_new_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Remove follows in both directions
  delete from public.follows
  where (follower_id = NEW.blocker_id and following_id = NEW.blocked_id)
     or (follower_id = NEW.blocked_id and following_id = NEW.blocker_id);

  -- And any follow request either way, with its notice
  delete from public.follow_requests
  where (requester_id = NEW.blocker_id and target_id = NEW.blocked_id)
     or (requester_id = NEW.blocked_id and target_id = NEW.blocker_id);
  perform public.clear_follow_request_notice(NEW.blocker_id, NEW.blocked_id);
  perform public.clear_follow_request_notice(NEW.blocked_id, NEW.blocker_id);

  -- Save current status, then mark as blocked
  update public.conversations
  set pre_block_status = status,
      status = 'blocked'
  where status != 'blocked'
    and participant_one = LEAST(NEW.blocker_id, NEW.blocked_id)
    and participant_two = GREATEST(NEW.blocker_id, NEW.blocked_id);

  return NEW;
end;
$$;

create or replace function public.sanction_user(
  p_kind text,
  p_user_id uuid,
  p_reason text,
  p_ends_at timestamp with time zone,
  p_report_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    -- Their follow requests go, with the notices and the pushes not yet sent.
    perform public.clear_follow_request_notice(p_user_id, r.target_id)
    from public.follow_requests r where r.requester_id = p_user_id;
    delete from public.follow_requests where requester_id = p_user_id;
    delete from public.notifications where actor_id = p_user_id and type = 'follow_request';
  end if;
  v_n := public.close_reports('user', p_user_id, 'actioned', p_reason, p_report_id);
  perform public.log_moderation_action(
    case p_kind when 'warning' then 'warn_user' when 'suspension' then 'suspend_user' else 'ban_user' end,
    'user', p_user_id, p_report_id, p_reason,
    case when p_ends_at is not null then jsonb_build_object('ends_at', p_ends_at) else '{}'::jsonb end);
  return jsonb_build_object('ok', true, 'reports_closed', v_n);
end;
$$;

-- 10. Push words.
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      when 'tag_missed' then
        v_actor || ' missed your tag. Tag them in your next post to get them going again.'
      when 'invite_joined' then
        case when coalesce(new.follow_request, false)
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

-- 11. Who may call what.
revoke execute on function public.get_follow_data(uuid, uuid),
  public.set_following(uuid, boolean),
  public.respond_follow_request(uuid, boolean, boolean),
  public.remove_follower(uuid),
  public.get_follow_requests(),
  public.set_account_controls(boolean, text, text)
  from public, anon;
grant execute on function public.get_follow_data(uuid, uuid),
  public.set_following(uuid, boolean),
  public.respond_follow_request(uuid, boolean, boolean),
  public.remove_follower(uuid),
  public.get_follow_requests(),
  public.set_account_controls(boolean, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
