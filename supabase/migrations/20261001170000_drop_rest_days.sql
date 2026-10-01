-- Rest days and the old daily streak leave the database (reactive posting, 2026-10-01: simple app,
-- no bloat). 20261001120000_reactive_posting already stopped using all of these; this removes them.
-- Pushed after every test phone had OTA 10.22, the app that no longer reads them (older builds
-- insert fitness_routine at sign-up and read streak_lowest, streak_last_upload_date, streak_logs).
-- Rollback: supabase/rollbacks/20261001170000_drop_rest_days.rollback.sql (columns come back empty).
-- Test: supabase/tests/drop_rest_days_test.sql
-- Kept: profiles.streak_current / streak_highest (the tag streak), posts.streak_day (the streak
-- after each post), posts.post_date and profiles.timezone (stats, feed, points' daily cap and
-- push quiet hours use them).

-- Training days ("fitness routine"): the days a streak had to be kept. Gone with rest days.
alter table public.profiles drop column fitness_routine;

-- The daily streak's own bookkeeping.
alter table public.profiles
  drop column streak_lowest,
  drop column streak_last_upload_date;

-- The daily streak's history, with its policies and indexes.
drop table public.streak_logs;

notify pgrst, 'reload schema';
