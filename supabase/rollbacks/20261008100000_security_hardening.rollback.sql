-- Undo 20261008100000_security_hardening: everything goes back to how it was live on 2026-10-07
-- (supabase/backups/20261007223735_schema.sql). Posts and photos are readable by every signed-in
-- person again, the bucket is public, direct post/tag inserts work, tag notifications ignore
-- blocks and bans, the app may insert any profile column, a public email sign-up passes the hook
-- inside a checked code's 30 minutes, and get_suggested_follows trusts its parameter.
-- reset-password calls revoke_user_sessions: deploy the previous reset-password first (or it logs
-- an error after each password change; the change itself still works).
begin;

-- 1. Posts.
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (hidden_at is null or public.is_staff());

-- 2. Photos, likes and comments.
drop policy if exists posts_storage_select on storage.objects;
create policy posts_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'posts');
update storage.buckets set public = true where id = 'posts';

drop policy if exists likes_insert on public.post_likes;
create policy likes_insert on public.post_likes
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists comments_insert on public.post_comments;
create policy comments_insert on public.post_comments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_banned)
  );

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

drop function public.can_view_post_id(uuid);
drop function public.can_view_posts_of(uuid);

grant execute on function public.get_feed_posts(int, timestamptz, uuid) to authenticated;

-- 3. Direct inserts.
grant insert on public.posts to anon, authenticated;
create policy posts_insert on public.posts
  for insert to authenticated
  with check (auth.uid() = user_id);

grant insert, update, delete on public.post_tags to anon, authenticated;
create policy post_tags_insert on public.post_tags
  for insert
  with check (exists (select 1 from public.posts p where p.id = post_tags.post_id and p.user_id = auth.uid()));

-- 4. Tag notifications.
create or replace function public.notify_on_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare post_owner uuid;
begin
  select user_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (new.user_id, post_owner, 'tag', new.post_id);
  end if;
  return new;
end; $$;

-- 5. Profiles.
revoke insert (id, username, display_name, first_name, last_name, date_of_birth, contact_number,
               fitness_goals, avatar_url, timezone)
  on public.profiles from authenticated;
grant insert on public.profiles to anon, authenticated;

-- 6. The sign-up hook as in 20261001100000_password_reset_codes.
create or replace function public.hook_require_verified_signup(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_provider text := event #>> '{user,app_metadata,provider}';
  v_email    text := lower(trim(event #>> '{user,email}'));
begin
  if v_provider in ('apple', 'google') then
    return '{}'::jsonb;
  end if;

  if v_provider = 'email' then
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

-- 7. Sign-out helper.
drop function public.revoke_user_sessions(uuid);

-- 8. Small things.
grant execute on function public.message_reactions_json(uuid, uuid) to public;

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

delete from supabase_migrations.schema_migrations where version = '20261008100000';

notify pgrst, 'reload schema';
commit;
