-- Undo 20260923101500_stats_views. Reading numbers only; nothing depends on these.
begin;
drop schema if exists stats cascade;
commit;
