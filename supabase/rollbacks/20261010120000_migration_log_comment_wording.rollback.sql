-- Undo 20261010120000_migration_log_comment_wording: nothing to undo in the database. That
-- migration only reworded comment lines kept in the migration log (supabase_migrations
-- .schema_migrations.statements); no table, function, rule or row of app data changed. The
-- earlier wording is not put back on purpose. If the log's text is ever needed as it was, it is in
-- the backup taken before the push.
begin;
select 1;
commit;
