-- Security hardening (security review, 2026-10-08).
-- 1. Posts follow the feed rule. posts_select let every signed-in person read every visible post;
--    now it is your own posts, staff, or a visible post the feed rule allows (can_view_post: you
--    follow them, no block either way, they are not banned, your feed is not locked). The app reads posts only
--    through get_feed / get_user_posts (run as their owner), so it sees no change.
-- 2. Photos are private (was supabase/deferred/private_bucket.sql). The posts bucket is no longer
--    public and a file opens (or signs) only for its owner, staff, or someone who can see its post
--    (can_view_post_object). Every app since 2026-09-17 signs its photos, so phones see no change.
--    Likes and comments only on posts you can see (comments keep the ban check); toggle_like
--    checks the same; the old get_feed_posts read goes.
-- 3. Posting only through create_post (was supabase/deferred/contract_posting.sql): no direct
--    inserts into posts, no direct writes to post_tags. create_post and start_tag run as their
--    owner, so they keep working.
-- 4. notify_on_tag: no tag notification across a block (either way) or from a banned person.
-- 5. Profiles: the app may insert only the sign-up columns (it could set its own points, ban
--    or join date before).
-- 6. Email sign-ups: hook_require_verified_signup also needs app_metadata.signup_via =
--    'complete-signup', which only complete-signup sets (service role). A public POST
--    /auth/v1/signup can't set app_metadata, so it is refused even inside a checked code's
--    30 minutes. Apple and Google are unchanged. Deploy complete-signup before this.
-- 7. revoke_user_sessions(uuid): signs a person out everywhere (server only); reset-password
--    calls it after setting the new password.
-- 8. message_reactions_json is internal (only definer functions call it); get_suggested_follows
--    answers for the caller (auth.uid()) whatever id is passed, with the same signature.
-- Test: supabase/tests/security_hardening_test.sql
-- Undo: supabase/rollbacks/20261008100000_security_hardening.rollback.sql

-- 1. Posts.
-- can_view_post takes any viewer, so the app may not call it; this asks only for the caller.
create function public.can_view_posts_of(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.can_view_post(auth.uid(), p_owner);
$$;
revoke execute on function public.can_view_posts_of(uuid) from public, anon;
grant execute on function public.can_view_posts_of(uuid) to authenticated;

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_staff()
    or (hidden_at is null and public.can_view_posts_of(user_id))
  );

-- 2. Photos, likes and comments.
drop policy if exists posts_storage_select on storage.objects;
create policy posts_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'posts' and public.can_view_post_object(name));

update storage.buckets set public = false where id = 'posts';

-- May the caller see this post? (Yours, or visible and allowed by the feed rule.)
create function public.can_view_post_id(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and (p.user_id = auth.uid() or (p.hidden_at is null and public.can_view_posts_of(p.user_id)))
  );
$$;
revoke execute on function public.can_view_post_id(uuid) from public, anon;
grant execute on function public.can_view_post_id(uuid) to authenticated;

drop policy if exists likes_insert on public.post_likes;
create policy likes_insert on public.post_likes
  for insert to authenticated
  with check (auth.uid() = user_id and public.can_view_post_id(post_id));

drop policy if exists comments_insert on public.post_comments;
create policy comments_insert on public.post_comments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and not exists (select 1 from public.profiles where id = auth.uid() and is_banned)
    and public.can_view_post_id(post_id)
  );

-- toggle_like runs as its owner, so it checks the rule itself (otherwise as live).
create or replace function public.toggle_like(p_post_id uuid, p_user_id uuid)
returns table(liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  _liked boolean;
  _rows int;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.can_view_post_id(p_post_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.post_likes (post_id, user_id) values (p_post_id, p_user_id)
  on conflict (post_id, user_id) do nothing;
  get diagnostics _rows = row_count;
  if _rows > 0 then
    _liked := true;
  else
    delete from public.post_likes where post_id = p_post_id and user_id = p_user_id;
    _liked := false;
  end if;
  return query select _liked, count(*) from public.post_likes where post_id = p_post_id;
end;
$$;
revoke execute on function public.toggle_like(uuid, uuid) from public, anon;
grant execute on function public.toggle_like(uuid, uuid) to authenticated;

revoke execute on function public.get_feed_posts(int, timestamptz, uuid) from public, anon, authenticated;

-- 3. Posting only through create_post.
drop policy if exists posts_insert on public.posts;
revoke insert on public.posts from anon, authenticated;

drop policy if exists post_tags_insert on public.post_tags;
revoke insert, update, delete on public.post_tags from anon, authenticated;

-- 4. Tag notifications.
create or replace function public.notify_on_tag()
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
     and not exists (select 1 from public.profiles where id = post_owner and is_banned)
     and not exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = post_owner and b.blocked_id = new.user_id)
          or (b.blocker_id = new.user_id and b.blocked_id = post_owner)
     ) then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (new.user_id, post_owner, 'tag', new.post_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_on_tag() from public, anon, authenticated;

-- 5. Profiles: the sign-up columns only (src/components/CreateAccountSheet.tsx inserts id,
--    username, display_name, first_name, last_name, date_of_birth, contact_number, fitness_goals).
revoke insert on public.profiles from anon, authenticated;
grant insert (id, username, display_name, first_name, last_name, date_of_birth, contact_number,
              fitness_goals, avatar_url, timezone)
  on public.profiles to authenticated;

-- 6. Email sign-ups only through complete-signup (otherwise as 20261001100000_password_reset_codes).
create or replace function public.hook_require_verified_signup(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_provider text := event #>> '{user,app_metadata,provider}';
  v_via      text := event #>> '{user,app_metadata,signup_via}';
  v_email    text := lower(trim(event #>> '{user,email}'));
begin
  if v_provider in ('apple', 'google') then
    return '{}'::jsonb;
  end if;

  if v_provider = 'email' then
    if v_via is distinct from 'complete-signup' then
      raise log 'hook_require_verified_signup: email sign-up outside complete-signup for %', v_email;
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 403, 'message', 'Sign up in the Mahi app.'));
    end if;
    if exists (
      select 1 from public.otp_codes c
      where c.email = v_email
        and c.purpose = 'signup'
        and c.verified_at > now() - interval '30 minutes'
    ) then
      return '{}'::jsonb;
    end if;
    raise log 'hook_require_verified_signup: email sign-up without a verified code for %', v_email;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'Verify your email code first.'));
  end if;

  raise log 'hook_require_verified_signup: refused provider % for %', coalesce(v_provider, '(none)'), v_email;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Sign-up method not allowed.'));
end;
$$;
revoke execute on function public.hook_require_verified_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_require_verified_signup(jsonb) to supabase_auth_admin;

-- 7. Sign a person out everywhere (as sanction_user does for a ban). Server only.
create function public.revoke_user_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
$$;
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- 8. Small things.
revoke execute on function public.message_reactions_json(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_suggested_follows(
  p_current_user_id uuid, p_limit integer default 20, p_offset integer default 0
)
returns table(id uuid, username text, display_name text, avatar_url text, mutual_count bigint)
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
$$;
revoke execute on function public.get_suggested_follows(uuid, int, int) from public, anon;
grant execute on function public.get_suggested_follows(uuid, int, int) to authenticated;

notify pgrst, 'reload schema';
