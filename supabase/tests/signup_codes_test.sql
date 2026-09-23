-- Sign-up codes: only the server can read them, and an email account can only be created
-- after its code was checked by the server in the last 30 minutes.
begin;
select plan(14);

create function pg_temp.hook(p_provider text, p_email text) returns jsonb language sql as $$
  select public.hook_require_verified_signup(jsonb_build_object('user', jsonb_build_object(
    'email', p_email, 'app_metadata', jsonb_build_object('provider', p_provider))));
$$;

insert into public.otp_codes (email, code_hash, expires_at, used, verified_at) values
  ('fresh@example.invalid', 'x', now() + interval '10 minutes', true, now() - interval '1 minute'),
  ('stale@example.invalid', 'x', now() - interval '10 minutes', true, now() - interval '31 minutes'),
  ('unchecked@example.invalid', 'x', now() + interval '10 minutes', false, null);

select is(pg_temp.hook('email', 'fresh@example.invalid'), '{}'::jsonb,
  'email sign-up with a code checked a minute ago is allowed');
select is(pg_temp.hook('email', '  Fresh@Example.invalid '), '{}'::jsonb,
  'the email is matched regardless of case and spaces');
select is(pg_temp.hook('email', 'stale@example.invalid') #>> '{error,http_code}', '403',
  'a code checked more than 30 minutes ago is not enough');
select is(pg_temp.hook('email', 'unchecked@example.invalid') #>> '{error,http_code}', '403',
  'a code that was sent but never checked is not enough');
select is(pg_temp.hook('email', 'nobody@example.invalid') #>> '{error,http_code}', '403',
  'no code at all is refused');
select is(pg_temp.hook('apple', 'someone@example.invalid'), '{}'::jsonb,
  'Apple sign-in is allowed (Apple checked the email)');
select is(pg_temp.hook('google', 'someone@example.invalid'), '{}'::jsonb,
  'Google sign-in is allowed (Google checked the email)');
select is(pg_temp.hook('phone', 'someone@example.invalid') #>> '{error,http_code}', '403',
  'any other sign-up method is refused');

select ok(has_function_privilege('supabase_auth_admin', 'public.hook_require_verified_signup(jsonb)', 'execute'),
  'Supabase Auth can run the rule');
select ok(not has_function_privilege('anon', 'public.hook_require_verified_signup(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.hook_require_verified_signup(jsonb)', 'execute'),
  'the app cannot run the rule');
select ok(has_table_privilege('supabase_auth_admin', 'public.otp_codes', 'select')
  and exists (select 1 from pg_policies where tablename = 'otp_codes' and 'supabase_auth_admin' = any(roles)),
  'Supabase Auth can read the codes table');

set local role anon;
select throws_ok('select 1 from public.otp_codes', '42501', null, 'signed-out apps cannot read codes');
reset role;
set local role authenticated;
select throws_ok('select 1 from public.otp_codes', '42501', null, 'signed-in apps cannot read codes');
select throws_ok('select 1 from public.auth_rate_limits', '42501', null, 'apps cannot read send limits');
reset role;

select * from finish();
rollback;
