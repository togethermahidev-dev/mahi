-- Feed and profile reads are for signed-in people only (20261006170000_signed_in_reads).
-- get_feed_posts is gone altogether (20261008160000_drop_dead_functions; drop_dead_functions_test).
begin;
select plan(2);
select is(has_function_privilege('anon', 'public.get_follow_data(uuid, uuid)', 'execute'),
  false, 'signed out: no get_follow_data');
select is(has_function_privilege('authenticated', 'public.get_follow_data(uuid, uuid)', 'execute'),
  true, 'signed in: get_follow_data');
select * from finish();
rollback;
