-- Push wording, round 5 (20261006120000_push_deadline_wording): deadlines as a day and clock time
-- in the person's time zone, worked out when the push is sent; the 2-hours-left reminder kept for
-- early-morning deadlines; the missed and answered words.
-- Every check reads only this test's own people, so it also runs on a database with history.
begin;
select plan(25);

-- 1. How a deadline is said. Seen from Tue 6 Oct 2026, 13:00 in London (12:00 UTC).
select is(public.format_deadline('2026-10-06 21:40+00', 'Europe/London', '2026-10-06 12:00+00'),
  '10:40pm tonight', 'later the same evening: tonight');
select is(public.format_deadline('2026-10-06 08:00+00', 'Europe/London', '2026-10-06 06:00+00'),
  '9:00am today', 'the same morning: today');
select is(public.format_deadline('2026-10-07 21:40+00', 'Europe/London', '2026-10-06 12:00+00'),
  '10:40pm tomorrow', 'the next day: tomorrow');
select is(public.format_deadline('2026-10-08 21:40+00', 'Europe/London', '2026-10-06 12:00+00'),
  'Thu 10:40pm', 'two days on: the day''s name');
select is(public.format_deadline('2026-10-14 21:40+00', 'Europe/London', '2026-10-06 12:00+00'),
  '14 Oct 10:40pm', 'a week or more: the date');
select is(public.format_deadline('2026-10-07 03:30+00', 'America/New_York', '2026-10-06 12:00+00'),
  '11:30pm tonight', 'in the person''s own time zone');
select is(public.format_deadline('2026-10-07 11:00+00', 'UTC', '2026-10-06 12:00+00'),
  '11:00am tomorrow', 'morning hours read am');

-- 2. Times in words.
select is(public.format_duration(interval '30 seconds'), '1 minute', 'never "0 minutes"');
select is(public.format_duration(interval '45 minutes'), '45 minutes', 'minutes');
select is(public.format_duration(interval '1 hour 20 minutes'), '1 hour', 'hours');
select is(public.format_duration(interval '3 hours'), '3 hours', 'hours, plural');
select is(public.format_duration(interval '26 hours'), '1 day 2 hours', 'a day and hours');
select is(public.format_duration(interval '48 hours'), '2 days', 'whole days');

-- The rules as set on production: quiet hours 22:00–07:00, 48 hours to answer.
update public.app_config set quiet_start = '22:00', quiet_end = '07:00', tag_window = '48 hours',
  feed_lock_warning_push = false, feed_locked_push = false;

-- 3. The last call.
select is(public.last_call_time('2026-10-08 20:40+00', '2026-10-08 22:40+00', 'UTC'),
  '2026-10-08 20:40+00'::timestamptz, 'a reminder outside quiet hours goes when it always did');
select is(public.last_call_time('2026-10-08 04:00+00', '2026-10-08 06:00+00', 'UTC'),
  '2026-10-07 21:45+00'::timestamptz,
  'a 6am deadline: the 2-hours-left reminder goes at 9:45pm the evening before, not dropped');
select is(public.last_call_time('2026-10-08 22:30+00', '2026-10-09 00:30+00', 'UTC'),
  '2026-10-08 21:45+00'::timestamptz, 'a 12:30am deadline: 9:45pm that evening');
select is(public.last_call_time('2026-10-08 05:00+00', '2026-10-08 09:00+00', 'UTC'),
  '2026-10-08 05:00+00'::timestamptz, 'a reminder held till 7am that is still in time just waits, as before');

-- 4. What is queued, and what is sent. A tags B (a normal tag) and C (an early-morning deadline).
create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000dd' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'pdw-' || c || '@example.invalid' from unnest(array['a','b','c']) c;
insert into public.profiles (id, username, timezone)
select pg_temp.uid(c), 'pdw_test_' || c, 'UTC' from unnest(array['a','b','c']) c;
insert into public.posts (id, user_id, image_url, image_path, streak_day) values
  ('00000000-0000-0000-0000-00000000dd99', pg_temp.uid('a'), 'x', pg_temp.uid('a') || '/1.jpg', 0);
insert into public.tag_challenges (post_id, tagger_id, tagged_id, expires_at, started_at) values
  ('00000000-0000-0000-0000-00000000dd99', pg_temp.uid('a'), pg_temp.uid('b'), now() + interval '48 hours', now()),
  ('00000000-0000-0000-0000-00000000dd99', pg_temp.uid('a'), pg_temp.uid('c'),
   ((current_date + 2) + time '05:00') at time zone 'UTC', now());
insert into public.post_tags (post_id, user_id) values
  ('00000000-0000-0000-0000-00000000dd99', pg_temp.uid('b'));

select is((select body from public.push_outbox where user_id = pg_temp.uid('b') and kind = 'tag'),
  '@pdw_test_a tagged you. Post any workout by {deadline}.',
  'the tag push is queued with its deadline left to fill in');
select is(
  (select string_agg(body, ' | ' order by send_after) from public.push_outbox
   where user_id = pg_temp.uid('b') and kind = 'tag_reminder'),
  'Answer @pdw_test_a''s tag by {deadline}. | Last call: answer @pdw_test_a''s tag by {deadline}.',
  'the two reminders, the same way');
select is(
  (select send_after from public.push_outbox
   where user_id = pg_temp.uid('c') and kind = 'tag_reminder' and dedupe_key like '%:2h'),
  ((current_date + 1) + time '21:45') at time zone 'UTC',
  'a 5am deadline still gets its last call, the evening before');

-- Sent hours later than queued (quiet hours): the words are true when they land.
update public.push_outbox set send_after = now() - interval '5 minutes'
where user_id = pg_temp.uid('b') and kind = 'tag';
select is(
  (select body from public.claim_push_batch(1000) where user_id = pg_temp.uid('b') and kind = 'tag'),
  '@pdw_test_a tagged you. Post any workout by '
    || public.format_deadline(now() + interval '48 hours', 'UTC', now()) || '.',
  'the sender gets the deadline as a day and time');
select is((select body like '%{deadline}%' from public.push_outbox
           where user_id = pg_temp.uid('b') and kind = 'tag'), true,
  'and the queue keeps the pattern (a retry fills it in again)');

-- A tag whose deadline has passed: its reminder is closed, not sent.
update public.tag_challenges set expires_at = now() - interval '1 minute'
where tagged_id = pg_temp.uid('c');
update public.push_outbox set send_after = now() - interval '1 minute'
where user_id = pg_temp.uid('c') and kind = 'tag_reminder';
select is((select count(*)::int from public.claim_push_batch(1000) where user_id = pg_temp.uid('c')), 0,
  'a reminder for a deadline that has gone is not sent');
select is((select array_agg(distinct error) from public.push_outbox
           where user_id = pg_temp.uid('c') and kind = 'tag_reminder'), array['stale'],
  'it is closed as stale');

-- 5. The tagger's pushes.
insert into public.notifications (user_id, actor_id, type, post_id) values
  (pg_temp.uid('a'), pg_temp.uid('c'), 'tag_missed', '00000000-0000-0000-0000-00000000dd99');
select is((select body from public.push_outbox where user_id = pg_temp.uid('a') and kind = 'tag_missed'),
  '@pdw_test_c missed your tag. Tag them in your next post to get them going again.',
  'a missed tag gives the tagger something kind to do');

select * from finish();
rollback;
