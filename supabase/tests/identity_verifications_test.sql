-- Identity checks (Didit, app flag identity-verification): one row per Didit session.
-- Only the server (service role, via record_identity_verification) writes; each person reads
-- only their own rows. Webhooks may arrive twice or out of order.
-- a and b are people; ghost has no account.
begin;
select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d1d0a', 'idv-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000d1d0b', 'idv-b@example.invalid');

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object(
           'sub', '00000000-0000-0000-0000-0000000d1d0' || p_who, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.rec(p_session text, p_user text, p_status text, p_at timestamptz)
returns text language sql as $$
  select public.record_identity_verification(
    p_session, ('00000000-0000-0000-0000-0000000d1d0' || p_user)::uuid, p_status,
    'Didit ' || p_status, jsonb_build_object('didit_status', p_status), p_at);
$$;

select has_table('public', 'identity_verifications', 'identity_verifications exists');
select ok((select relrowsecurity from pg_class where oid = 'public.identity_verifications'::regclass),
  'row level security is on');

-- The session function stores a placeholder row first (event time = epoch).
select is(pg_temp.rec('sess-1', 'a', 'pending', 'epoch'), 'saved', 'a new session is stored');
select is(pg_temp.rec('sess-ghost', 'f', 'pending', now()), 'unknown_user',
  'a session for someone with no account is not stored');

-- Webhooks.
select is(pg_temp.rec('sess-1', 'a', 'in_review', '2026-10-02 10:00+00'), 'saved', 'a webhook updates it');
select is(pg_temp.rec('sess-1', 'a', 'in_review', '2026-10-02 10:00+00'), 'saved',
  'the same webhook again is fine (Didit retries)');
select is((select count(*)::int from public.identity_verifications where session_id = 'sess-1'), 1,
  'still one row for the session');
select is(pg_temp.rec('sess-1', 'a', 'approved', '2026-10-02 10:05+00'), 'saved', 'a newer webhook updates it');
select is(pg_temp.rec('sess-1', 'a', 'pending', '2026-10-02 10:01+00'), 'stale',
  'an older webhook arriving late is ignored');
select is((select status from public.identity_verifications where session_id = 'sess-1'), 'approved',
  'so the newest status stays');
select is(pg_temp.rec('sess-1', 'b', 'declined', '2026-10-02 10:10+00'), 'saved',
  'a later webhook naming someone else still updates the session');
select is((select user_id from public.identity_verifications where session_id = 'sess-1'),
  '00000000-0000-0000-0000-0000000d1d0a'::uuid, 'but the session stays with the person who started it');
select throws_ok($$select pg_temp.rec('sess-2', 'a', 'great', now())$$, '23514', null,
  'only known statuses are stored');

-- Reading and writing from the app.
select is(pg_temp.rec('sess-b', 'b', 'pending', 'epoch'), 'saved', 'b starts a check too');
select pg_temp.as_user('a');
select is((select count(*)::int from public.identity_verifications), 1, 'a sees only their own check');
select throws_ok(
  $$insert into public.identity_verifications (user_id, session_id, status)
    values ('00000000-0000-0000-0000-0000000d1d0a', 'forged', 'approved')$$,
  '42501', null, 'the app cannot write a result');
select throws_ok(
  $$update public.identity_verifications set status = 'approved'$$,
  '42501', null, 'or change one');
reset role;
select set_config('role', 'anon', true);
select throws_ok($$select * from public.identity_verifications$$, '42501', null,
  'signed-out apps read nothing');
reset role;

select ok(not has_function_privilege('authenticated', 'public.record_identity_verification(text, uuid, text, text, jsonb, timestamptz)', 'execute'),
  'the app cannot call the writer');
select ok(has_function_privilege('service_role', 'public.record_identity_verification(text, uuid, text, text, jsonb, timestamptz)', 'execute'),
  'the edge functions (service role) can');

delete from auth.users where id = '00000000-0000-0000-0000-0000000d1d0a';
select is((select count(*)::int from public.identity_verifications
  where user_id = '00000000-0000-0000-0000-0000000d1d0a'), 0, 'deleting the account deletes its checks');

select * from finish();
rollback;
