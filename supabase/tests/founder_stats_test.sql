-- Founder numbers of record: signups, active people, retention, activation and churn, counted
-- off the tables themselves. Migration: 20261007160000_founder_stats.
--
-- Two kinds of check. Retention and churn use a made-up cohort in January 2020 (no real data
-- is that old), with activity dated by hand, so the counts are exact on any database. Posts
-- cannot be backdated (posts_set_post_date stamps now()), so activation reads this week's
-- cohort and counts only the change this test makes, like stats_test.sql.
begin;
select plan(27);

-- A and B join on Monday 6 January 2020, C the week after.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f5a0a', 'fs-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000f5a0b', 'fs-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000f5a0c', 'fs-c@example.invalid'),
  ('00000000-0000-0000-0000-0000000f5a0d', 'fs-d@example.invalid');
insert into public.profiles (id, username, timezone, created_at) values
  ('00000000-0000-0000-0000-0000000f5a0a', 'fs_a', 'Europe/London', '2020-01-06 10:00Z'),
  ('00000000-0000-0000-0000-0000000f5a0b', 'fs_b', 'Europe/London', '2020-01-06 11:00Z'),
  ('00000000-0000-0000-0000-0000000f5a0c', 'fs_c', 'Europe/London', '2020-01-13 09:00Z');

-- Something to like and comment on (made today; only the likes and comments are backdated).
insert into public.posts (id, user_id, image_url, streak_day, post_date)
values ('00000000-0000-0000-0000-0000000f5b01', '00000000-0000-0000-0000-0000000f5a0a', 'x', 0,
        current_date);

-- B follows A on day 0; A follows back on day 1, which makes them friends that day.
insert into public.follows (follower_id, following_id, created_at) values
  ('00000000-0000-0000-0000-0000000f5a0b', '00000000-0000-0000-0000-0000000f5a0a', '2020-01-06 12:00Z'),
  ('00000000-0000-0000-0000-0000000f5a0a', '00000000-0000-0000-0000-0000000f5a0b', '2020-01-07 08:00Z');
-- A likes on day 7 (week 1) and comments on day 30.
insert into public.post_likes (post_id, user_id, created_at) values
  ('00000000-0000-0000-0000-0000000f5b01', '00000000-0000-0000-0000-0000000f5a0a', '2020-01-13 08:00Z');
insert into public.post_comments (post_id, user_id, content, created_at) values
  ('00000000-0000-0000-0000-0000000f5b01', '00000000-0000-0000-0000-0000000f5a0a', 'hi', '2020-02-05 08:00Z');
-- C sends a message on day 1.
insert into public.conversations (id, participant_one, participant_two, status, initiated_by) values
  ('00000000-0000-0000-0000-0000000f5c01', '00000000-0000-0000-0000-0000000f5a0a',
   '00000000-0000-0000-0000-0000000f5a0c', 'active', '00000000-0000-0000-0000-0000000f5a0c');
insert into public.messages (conversation_id, sender_id, content, created_at) values
  ('00000000-0000-0000-0000-0000000f5c01', '00000000-0000-0000-0000-0000000f5a0c', 'yo', '2020-01-14 08:00Z');

-- 1. Daily actions.
select is((select signups from stats.actions_daily where day = '2020-01-06'), 2, 'two signups on the 6th');
select is((select follows from stats.actions_daily where day = '2020-01-07'), 1, 'one follow on the 7th');
select is((select friendships from stats.actions_daily where day = '2020-01-06'), 0,
  'a one-way follow is not a friendship');
select is((select friendships from stats.actions_daily where day = '2020-01-07'), 1,
  'the follow back makes one friendship, counted once, on the day it formed');
select is((select messages from stats.actions_daily where day = '2020-01-14'), 1, 'one message on the 14th');
select is((select likes from stats.actions_daily where day = '2020-01-13'), 1, 'one like on the 13th');

-- 2. Active people: anyone who did something that day, each counted once.
select is((select dau from stats.active_daily where day = '2020-01-06'), 1, 'B was active on the 6th');
select is((select dau from stats.active_daily where day = '2020-01-07'), 1, 'A was active on the 7th');
select is((select wau from stats.active_daily where day = '2020-01-07'), 2,
  'A and B in the seven days to the 7th');
select is((select mau from stats.active_daily where day = '2020-01-14'), 3,
  'A, B and C in the 30 days to the 14th');
select is((select stickiness_pct from stats.active_daily where day = '2020-01-14'), 33.3,
  'stickiness is that day''s active people over the month''s');

-- 3. Weekly retention: week 0 is the signup week.
select is((select signups from stats.retention_weekly where cohort_week = '2020-01-06' and weeks_after = 0),
  2, 'the 6 January cohort is A and B');
select is((select active from stats.retention_weekly where cohort_week = '2020-01-06' and weeks_after = 0),
  2, 'both did something in their first week');
select is((select active from stats.retention_weekly where cohort_week = '2020-01-06' and weeks_after = 1),
  1, 'only A came back in week 1');
select is((select active_pct from stats.retention_weekly where cohort_week = '2020-01-06' and weeks_after = 1),
  50.0, 'half the cohort came back in week 1');

-- 4. Day 1 / 7 / 30: came back on exactly that day after signing up.
select is((select d1_returned from stats.retention_days where cohort_week = '2020-01-06'), 1,
  'A came back on day 1');
select is((select d7_returned from stats.retention_days where cohort_week = '2020-01-06'), 1,
  'A came back on day 7');
select is((select d30_returned from stats.retention_days where cohort_week = '2020-01-06'), 1,
  'A came back on day 30');
select is((select d1_returned from stats.retention_days where cohort_week = '2020-01-13'), 1,
  'C came back on day 1');

-- 5. Churn: the week after, who stopped.
select is((select dormant from stats.lifecycle_weekly where week = '2020-01-13'), 1,
  'B was active the week before and not this week');
select is((select new from stats.lifecycle_weekly where week = '2020-01-13'), 1,
  'C is new that week');
select is((select retained from stats.lifecycle_weekly where week = '2020-01-13'), 1,
  'A carried on from the week before');

-- 6. Activation: D joins today and posts today.
create table pg_temp.base as
select coalesce((select signups from stats.activation_weekly
                 where cohort_week = date_trunc('week', now() at time zone 'UTC')::date), 0) as signups,
       coalesce((select first_post_7d from stats.activation_weekly
                 where cohort_week = date_trunc('week', now() at time zone 'UTC')::date), 0) as posted;
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000f5a0d', 'fs_d', 'Europe/London');
insert into public.posts (user_id, image_url, streak_day, post_date)
values ('00000000-0000-0000-0000-0000000f5a0d', 'x', 0, current_date);
select is((select signups from stats.activation_weekly
           where cohort_week = date_trunc('week', now() at time zone 'UTC')::date)
          - (select signups from pg_temp.base), 1, 'D is in this week''s cohort');
select is((select first_post_7d from stats.activation_weekly
           where cohort_week = date_trunc('week', now() at time zone 'UTC')::date)
          - (select posted from pg_temp.base), 1, 'D posted within 7 days of joining');

-- 7. PostHog's read-only login sees the totals and nothing else.
select ok(has_table_privilege('posthog_reader', 'stats.actions_daily', 'select'),
  'the reader can read the totals');
select ok(not has_table_privilege('posthog_reader', 'stats.activity', 'select'),
  'the reader cannot read who did what on which day');
select ok(not has_table_privilege('posthog_reader', 'public.messages', 'select'),
  'the reader cannot read any app table');

select * from finish();
rollback;
