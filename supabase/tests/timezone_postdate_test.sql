-- Every post is dated by the server in the user's local day (time zone). Any number a day.
begin;
select plan(10);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000a001', 'tz-test-a@example.invalid'),
       ('00000000-0000-0000-0000-00000000a002', 'tz-test-b@example.invalid');
insert into public.profiles (id, username, timezone)
values ('00000000-0000-0000-0000-00000000a001', 'tz_test_a', 'Pacific/Kiritimati'),
       ('00000000-0000-0000-0000-00000000a002', 'tz_test_b', 'Europe/London');

-- The server dates the post in the poster's time zone, whatever the client sends.
insert into public.posts (user_id, image_url, streak_day, created_at, post_date)
values ('00000000-0000-0000-0000-00000000a001', 'x', 1, now() - interval '30 days', '2000-01-01');
select is(
  (select post_date from public.posts where user_id = '00000000-0000-0000-0000-00000000a001'),
  (now() at time zone 'Pacific/Kiritimati')::date,
  'post_date is today in the poster''s time zone'
);
select ok(
  (select created_at from public.posts where user_id = '00000000-0000-0000-0000-00000000a001') = now(),
  'created_at is set by the server'
);

-- More than one post a day is fine now: you post whenever someone tags you.
select lives_ok(
  $$insert into public.posts (user_id, image_url, streak_day)
    values ('00000000-0000-0000-0000-00000000a001', 'y', 1)$$,
  'a second post on the same local day is allowed'
);

-- Yesterday's local post (same UTC day) does not block today's. The old UTC rule refused this.
set local session_replication_role = replica;
insert into public.posts (user_id, image_url, streak_day, created_at, post_date)
values ('00000000-0000-0000-0000-00000000a002', 'z', 1, now(),
        (now() at time zone 'Europe/London')::date - 1);
set local session_replication_role = origin;
select lives_ok(
  $$insert into public.posts (user_id, image_url, streak_day)
    values ('00000000-0000-0000-0000-00000000a002', 'w', 2)$$,
  'a new local day allows a post even when the UTC day is the same'
);

-- Clients cannot re-date a post.
update public.posts set post_date = '2000-01-01', created_at = '2000-01-01'
where user_id = '00000000-0000-0000-0000-00000000a001';
select is(
  (select count(*)::int from public.posts
   where user_id = '00000000-0000-0000-0000-00000000a001' and post_date = '2000-01-01'),
  0,
  'post_date cannot be changed'
);
select ok(
  (select bool_and(created_at = now()) from public.posts where user_id = '00000000-0000-0000-0000-00000000a001'),
  'created_at cannot be changed'
);

-- Only real time zones are accepted.
select throws_ok(
  $$update public.profiles set timezone = 'Mars/Olympus' where username = 'tz_test_b'$$,
  '22023', null,
  'invalid time zone is refused'
);
select lives_ok(
  $$update public.profiles set timezone = 'America/New_York' where username = 'tz_test_b'$$,
  'valid time zone is accepted'
);

select hasnt_index('public', 'posts', 'posts_user_day_unique', 'the UTC-day index is gone');
select hasnt_index('public', 'posts', 'posts_user_post_date_unique', 'the one-post-a-day index is gone');

select * from finish();
rollback;
