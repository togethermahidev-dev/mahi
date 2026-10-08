-- Security follow-ups (second review, 2026-10-08).
-- 1. Email sign-ups: the hook no longer relies on what the sign-up event carries (Supabase's docs
--    don't say whether admin-created users reach the hook, or with which app_metadata). Instead
--    complete-signup stamps the checked code (otp_codes.signup_claimed_at) right before it creates
--    the account, and the hook needs a stamp from the last 5 minutes. Only complete-signup (service
--    role) can stamp; a public POST /auth/v1/signup can't. If the hook does run for complete-signup,
--    the stamp is there; if it doesn't, nothing changes. Deploy complete-signup right after this.
-- 2. Reports: a report keeps a copy of what was reported (snapshot: a post's caption and paths, a
--    comment's text). The reporter could read it back, so reporting a post or comment they can't
--    see showed it to them. The app reads its own reports only to count them; the copy is now
--    readable by staff only (through the staff functions).
-- 3. get_comment_likes / get_comment_likers follow the post: nothing for a post you can't see or a
--    removed comment (as 20261008120000_comment_like_visibility does for the tables).
-- Test: supabase/tests/security_followups_test.sql
-- Undo: supabase/rollbacks/20261008130000_security_followups.rollback.sql

-- 1. Sign-up stamp.
alter table public.otp_codes add column signup_claimed_at timestamptz;

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
        and c.signup_claimed_at > now() - interval '5 minutes'
    ) then
      return '{}'::jsonb;
    end if;
    raise log 'hook_require_verified_signup: email sign-up outside complete-signup for %', v_email;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'Sign up in the Mahi app.'));
  end if;

  raise log 'hook_require_verified_signup: refused provider % for %', coalesce(v_provider, '(none)'), v_email;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Sign-up method not allowed.'));
end;
$$;
revoke execute on function public.hook_require_verified_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_require_verified_signup(jsonb) to supabase_auth_admin;

-- 2. Report copies: staff only.
revoke select on public.user_reports from anon, authenticated;
grant select (id, reporter_id, reported_user_id, reported_post_id, reported_comment_id,
              reported_message_id, target_type, target_id, target_owner_id, reason, description,
              status, source, created_at)
  on public.user_reports to authenticated;

-- 3. Comment likes follow the post.
create or replace function public.get_comment_likes(p_post_id uuid)
returns table(comment_id uuid, like_count bigint, liked_by_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         (select count(*) from public.comment_likes l where l.comment_id = c.id),
         exists (
           select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()
         )
  from public.post_comments c
  where c.post_id = p_post_id
    and c.removed_at is null
    and auth.uid() is not null
    and (public.is_staff() or public.can_view_post_id(p_post_id));
$$;

create or replace function public.get_comment_likers(p_comment_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, liked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, l.created_at
  from public.comment_likes l
  join public.post_comments c on c.id = l.comment_id and c.removed_at is null
  join public.profiles p on p.id = l.user_id and not p.is_banned
  where l.comment_id = p_comment_id
    and auth.uid() is not null
    and (public.is_staff() or public.can_view_post_id(c.post_id))
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = l.user_id)
         or (b.blocker_id = l.user_id and b.blocked_id = auth.uid())
    )
  order by l.created_at desc, p.username
  limit 500;
$$;

notify pgrst, 'reload schema';
