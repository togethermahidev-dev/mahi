-- Undo 20261007200000_invites_weekly. Remove the table from the PostHog source first, or its
-- next sync fails.
begin;
drop view if exists stats.invites_weekly;
commit;
