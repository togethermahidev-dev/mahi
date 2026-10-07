-- Undo 20261007160000_founder_stats. Reading numbers only; nothing in the app depends on these.
-- Disconnect the PostHog source first, or its next sync fails (it can no longer log in).
begin;
drop view if exists stats.lifecycle_weekly;
drop view if exists stats.activation_weekly;
drop view if exists stats.retention_days;
drop view if exists stats.retention_weekly;
drop view if exists stats.active_daily;
drop view if exists stats.actions_daily;
drop view if exists stats.activity;
revoke all on all tables in schema stats from posthog_reader;
revoke usage on schema stats from posthog_reader;
drop role if exists posthog_reader;
commit;
