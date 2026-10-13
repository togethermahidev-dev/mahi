-- Undo 20261013100000_account_deletion_reasons: deletions stop being kept and posted to Slack,
-- and the reasons already kept go with their table (back account_deletions up first if they
-- should be kept). Deleting an account itself is untouched. An app with the reasons switch on
-- then finds no set_account_deletion_reason and deletes the account without one.
begin;

drop trigger if exists trg_profiles_record_deletion on public.profiles;
drop view if exists stats.account_deletions_daily;
drop table if exists public.account_deletions;
drop table if exists public.account_deletion_reasons;
drop function if exists public.set_account_deletion_reason(text, text);
drop function if exists public.record_account_deletion();
drop function if exists public.notify_account_deletion();
drop function if exists public.account_deletion_slack_text(text, text, text, boolean);
drop function if exists public.account_deletion_reason_label(text);

notify pgrst, 'reload schema';
delete from supabase_migrations.schema_migrations where version = '20261013100000';

commit;
