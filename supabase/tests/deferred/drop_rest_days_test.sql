-- Rest days and the old daily streak's bookkeeping are gone. Run with the deferred step:
--   scripts/db.sh try supabase/deferred/drop_rest_days.sql supabase/tests/deferred/drop_rest_days_test.sql
-- (the default test run skips this folder on purpose: the columns are still there until then).
begin;
select plan(4);

select hasnt_column('public', 'profiles', 'fitness_routine', 'no training days on profiles');
select hasnt_column('public', 'profiles', 'streak_lowest', 'no lowest streak');
select hasnt_column('public', 'profiles', 'streak_last_upload_date', 'no last upload date');
select hasnt_table('public', 'streak_logs', 'no streak history table');

select * from finish();
rollback;
