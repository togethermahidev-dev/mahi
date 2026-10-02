-- Push notifications: token ownership, the outbox, quiet hours, and who may call what.
begin;
select plan(23);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'push-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000b002', 'push-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000b003', 'push-c@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-00000000b001', 'push_a', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000b002', 'push_b', 'America/New_York'),
  ('00000000-0000-0000-0000-00000000b003', 'push_c', 'Europe/London');

-- Quiet hours (22:00–07:00 local) move sends to 07:00.
select is(public.push_send_time('2026-01-15 23:00+00', 'Europe/London'), '2026-01-16 07:00+00'::timestamptz,
  '23:00 London is sent at 07:00 next day');
select is(public.push_send_time('2026-01-15 03:00+00', 'Europe/London'), '2026-01-15 07:00+00'::timestamptz,
  '03:00 London is sent at 07:00 the same day');
select is(public.push_send_time('2026-01-15 12:00+00', 'Europe/London'), '2026-01-15 12:00+00'::timestamptz,
  'midday is sent straight away');
select is(public.push_send_time('2026-07-16 03:30+00', 'America/New_York'), '2026-07-16 11:00+00'::timestamptz,
  '23:30 New York is sent at 07:00 New York');

-- The outbox skips self-actions, blocked pairs and banned actors, and dedupes.
select public.enqueue_push('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b001', 'like', 'self', '{}');
select is((select count(*)::int from public.push_outbox where body = 'self'), 0, 'no push for your own action');

insert into public.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b003');
select public.enqueue_push('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b003', 'like', 'blocked', '{}');
select is((select count(*)::int from public.push_outbox where body = 'blocked'), 0, 'no push between blocked users');

update public.profiles set is_banned = true where id = '00000000-0000-0000-0000-00000000b002';
select public.enqueue_push('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b002', 'like', 'banned', '{}');
select is((select count(*)::int from public.push_outbox where body = 'banned'), 0, 'no push from a banned user');
update public.profiles set is_banned = false where id = '00000000-0000-0000-0000-00000000b002';

select public.enqueue_push('00000000-0000-0000-0000-00000000b001', null, 'test', 'once', '{}', '2026-01-15 12:00+00', 'dedupe-1');
select public.enqueue_push('00000000-0000-0000-0000-00000000b001', null, 'test', 'once', '{}', '2026-01-15 12:00+00', 'dedupe-1');
select is((select count(*)::int from public.push_outbox where dedupe_key = 'dedupe-1'), 1, 'same dedupe key is queued once');

-- Existing activity (a follow) queues a push through the notifications table.
insert into public.follows (follower_id, following_id)
values ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b001');
select is(
  (select body from public.push_outbox where user_id = '00000000-0000-0000-0000-00000000b001' and kind = 'follow'),
  '@push_b started following you',
  'a new follow queues a push'
);

-- Token registration: the caller owns it; a shared phone moves it to the new account.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
select lives_ok($$select public.register_push_token('ExponentPushToken[test-1]', 'ios')$$, 'user A registers a token');
select throws_ok($$select public.register_push_token('not-a-token', 'ios')$$, '22023', null, 'malformed tokens are refused');
select throws_ok($$select * from public.push_tokens$$, '42501', null, 'clients cannot read tokens');
select throws_ok($$select public.enqueue_push('00000000-0000-0000-0000-00000000b002', null, 'x', 'x', '{}')$$,
  '42501', null, 'clients cannot queue pushes');
select throws_ok($$select * from public.claim_push_batch(10)$$, '42501', null, 'clients cannot claim the outbox');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}';
select public.unregister_push_token('ExponentPushToken[test-1]');
select public.register_push_token('ExponentPushToken[test-1]', 'android');
reset role;
select is((select user_id from public.push_tokens where token = 'ExponentPushToken[test-1]'),
  '00000000-0000-0000-0000-00000000b002'::uuid, 'a token re-registered on the same phone moves to the new account');

-- The worker claims due rows once and records results. Only this test's own rows are counted
-- and completed, so pushes already waiting in the database don't change the answer.
create function pg_temp.mine() returns setof public.push_outbox language sql as $$
  select * from public.push_outbox
  where user_id in ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b002',
                    '00000000-0000-0000-0000-00000000b003')
$$;
update public.push_outbox set send_after = now() - interval '1 minute'
where id in (select id from pg_temp.mine()) and sent_at is null;
select is((select count(*)::int from public.claim_push_batch(100000) c
           where c.id in (select id from pg_temp.mine())), 2, 'due rows are claimed');
select is((select count(*)::int from public.claim_push_batch(100000) c
           where c.id in (select id from pg_temp.mine())), 0, 'claimed rows are not handed out twice');

select public.complete_push(
  (select jsonb_agg(jsonb_build_object('id', id, 'tickets', '[{"ticket":"t1","token":"ExponentPushToken[test-1]"}]'::jsonb))
   from pg_temp.mine() where claimed_at is not null)
);
select is((select count(*)::int from pg_temp.mine() where sent_at is null), 0, 'completed rows are marked sent');

-- A push that is badly overdue when the sender gets to it (sending was paused, or not switched on
-- yet) is closed, not sent: by then what it says may no longer be true.
select col_default_is('public', 'app_config', 'push_stale_after', '1 hour', 'a push is stale after an hour, unless changed');
update public.app_config set push_stale_after = '1 hour';
insert into public.push_outbox (user_id, kind, body, send_after, dedupe_key) values
  ('00000000-0000-0000-0000-00000000b001', 'test', 'late', now() - interval '2 hours', 'dedupe-late'),
  ('00000000-0000-0000-0000-00000000b001', 'test', 'on time', now() - interval '30 minutes', 'dedupe-on-time');
select is(
  (select array_agg(c.body) from public.claim_push_batch(100000) c where c.id in (select id from pg_temp.mine())),
  array['on time'], 'a push half an hour overdue still goes; one two hours overdue does not');
select is((select error from pg_temp.mine() where body = 'late'), 'stale', 'the overdue one is closed as stale');
select ok((select sent_at is not null from pg_temp.mine() where body = 'late'), 'so it is never retried');

select public.remove_push_tokens(array['ExponentPushToken[test-1]']);
select is((select count(*)::int from public.push_tokens where token = 'ExponentPushToken[test-1]'), 0,
  'dead tokens are removed');

select * from finish();
rollback;
