-- Rest days and the old daily streak's bookkeeping are gone (20261001170000_drop_rest_days).
begin;
select plan(4);

select hasnt_column('public', 'profiles', 'fitness_routine', 'no training days on profiles');
select hasnt_column('public', 'profiles', 'streak_lowest', 'no lowest streak');
select hasnt_column('public', 'profiles', 'streak_last_upload_date', 'no last upload date');
select hasnt_table('public', 'streak_logs', 'no streak history table');

select * from finish();
rollback;
