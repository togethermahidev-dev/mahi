-- Rest days and the old daily streak leave the database (founder, 2026-10-01: simple app, no bloat).
-- Reactive posting (20261001120000_reactive_posting) already stopped using all of these; this
-- removes them. Push it only once every phone runs the app build that no longer reads them:
-- older builds read fitness_routine, streak_lowest, streak_last_upload_date and streak_logs.
-- Kept: profiles.streak_current / streak_highest (the tag streak), posts.streak_day (the streak
-- after each post), posts.post_date and profiles.timezone (stats, feed, points' daily cap and
-- push quiet hours use them).
-- Tests: supabase/tests/reactive_posting_test.sql, supabase/tests/account_delete_test.sql

-- Training days ("fitness routine"): the days a streak had to be kept. Gone with rest days.
alter table public.profiles drop column fitness_routine;

-- The daily streak's own bookkeeping.
alter table public.profiles
  drop column streak_lowest,
  drop column streak_last_upload_date;

-- The daily streak's history, with its policies and indexes.
drop table public.streak_logs;

notify pgrst, 'reload schema';
