-- Password reset by emailed code (flag auth-password-reset).
--   send-reset-code  stores a reset code's hash in otp_codes with purpose = 'reset'
--   reset-password   checks it (5 tries) and sets the new password with the admin API
-- Sign-up and reset codes share the table but never count for each other: the sign-up
-- functions only read purpose = 'signup' (the default, so today's live functions keep working
-- until the new ones are deployed), and the Before User Created rule ignores reset codes.
-- Test: supabase/tests/password_reset_codes_test.sql

alter table public.otp_codes
  add column purpose text not null default 'signup' check (purpose in ('signup', 'reset'));
create index otp_codes_email_purpose_created on public.otp_codes (email, purpose, created_at desc);

-- Same rule as 20260923230000_signup_codes, but only a checked SIGN-UP code allows an email sign-up.
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

-- reset-password needs the account id for an email; the admin API has no lookup by email.
-- Server only: the app must never learn which emails have accounts.
create function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;
revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
