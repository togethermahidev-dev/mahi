-- Undo 20261008130000_security_followups: the sign-up hook goes back to complete-signup's marker
-- (as 20261008100000_security_hardening), the report copy is readable by its reporter again, and
-- get_comment_likes / get_comment_likers stop checking the post (bodies as live on 2026-10-07).
-- Redeploy the previous complete-signup first: this one writes otp_codes.signup_claimed_at.
begin;

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

alter table public.otp_codes drop column signup_claimed_at;

grant select on public.user_reports to authenticated;

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
    and auth.uid() is not null;
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
  join public.profiles p on p.id = l.user_id and not p.is_banned
  where l.comment_id = p_comment_id
    and auth.uid() is not null
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = l.user_id)
         or (b.blocker_id = l.user_id and b.blocked_id = auth.uid())
    )
  order by l.created_at desc, p.username
  limit 500;
$$;

delete from supabase_migrations.schema_migrations where version = '20261008130000';

notify pgrst, 'reload schema';

commit;
