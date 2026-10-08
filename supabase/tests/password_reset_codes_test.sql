-- Password reset codes share otp_codes with sign-up codes, kept apart by `purpose`.
-- A checked reset code must never count as a checked sign-up code, and only the server can
-- look up which account an email belongs to.
begin;
select plan(10);

create function pg_temp.hook(p_email text) returns jsonb language sql as $$
  select public.hook_require_verified_signup(jsonb_build_object('user', jsonb_build_object(
    'email', p_email,
    'app_metadata', jsonb_build_object('provider', 'email', 'signup_via', 'complete-signup'))));
$$;

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'otp_codes' and column_name = 'purpose'),
  '''signup''::text',
  'codes are sign-up codes unless marked otherwise, so the live sign-up functions keep working');

insert into public.otp_codes (email, code_hash, expires_at) values
  ('plain@example.invalid', 'x', now() + interval '10 minutes');
select is((select purpose from public.otp_codes where email = 'plain@example.invalid'), 'signup',
  'a code stored without a purpose is a sign-up code');

select throws_ok(
  $$insert into public.otp_codes (email, code_hash, expires_at, purpose)
    values ('odd@example.invalid', 'x', now(), 'other')$$,
  '23514', null, 'only sign-up and reset codes can be stored');

insert into public.otp_codes (email, code_hash, expires_at, used, verified_at, purpose, signup_claimed_at) values
  ('reset-only@example.invalid', 'x', now() + interval '10 minutes', true, now() - interval '1 minute', 'reset', now()),
  ('signup-ok@example.invalid', 'x', now() + interval '10 minutes', true, now() - interval '1 minute', 'signup', now());

select is(pg_temp.hook('reset-only@example.invalid') #>> '{error,http_code}', '403',
  'a checked reset code does not allow an email sign-up');
select is(pg_temp.hook('signup-ok@example.invalid'), '{}'::jsonb,
  'a checked sign-up code still allows an email sign-up');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000fe5e7', 'Reset.Me@Example.invalid');
select is(public.auth_user_id_by_email('reset.me@example.invalid'),
  '00000000-0000-0000-0000-0000000fe5e7'::uuid,
  'the server finds the account for an email, whatever its case');
select is(public.auth_user_id_by_email('nobody@example.invalid'), null,
  'an email with no account gives nothing');

select ok(has_function_privilege('service_role', 'public.auth_user_id_by_email(text)', 'execute'),
  'the edge functions (service role) can look up an account');
select ok(not has_function_privilege('anon', 'public.auth_user_id_by_email(text)', 'execute'),
  'signed-out apps cannot look up accounts');
select ok(not has_function_privilege('authenticated', 'public.auth_user_id_by_email(text)', 'execute'),
  'signed-in apps cannot look up accounts');

select * from finish();
rollback;
