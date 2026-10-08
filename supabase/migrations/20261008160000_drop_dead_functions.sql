-- Drop two server functions nothing calls any more (cleanup, 2026-10-08):
-- * get_feed_posts(integer, timestamptz, uuid): the old feed read that skipped the feed rule. The
--   app reads get_feed; 20261008100000_security_hardening revoked it from everyone (live).
--   Last defined in 20261006100000_moderation.
-- * format_wait(interval): the old "45m" / "3h" wording. Pushes use format_duration since
--   20261006120000_push_deadline_wording. Last defined in 20260917112413_tag_challenges.
-- No function, trigger, view or cron job names either one (the test checks every function body).
-- Test: supabase/tests/drop_dead_functions_test.sql
-- Undo: supabase/rollbacks/20261008160000_drop_dead_functions.rollback.sql
drop function public.get_feed_posts(integer, timestamptz, uuid);
drop function public.format_wait(interval);

notify pgrst, 'reload schema';
