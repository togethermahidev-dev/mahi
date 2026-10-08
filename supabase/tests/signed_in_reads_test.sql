-- Feed and profile reads are for signed-in people only (20261006170000_signed_in_reads).
begin;
select plan(4);
select is(has_function_privilege('anon', 'public.get_feed_posts(integer, timestamptz, uuid)', 'execute'),
  false, 'signed out: no get_feed_posts');
select is(has_function_privilege('anon', 'public.get_follow_data(uuid, uuid)', 'execute'),
  false, 'signed out: no get_follow_data');
select is(has_function_privilege('authenticated', 'public.get_feed_posts(integer, timestamptz, uuid)', 'execute'),
  false, 'signed in: no get_feed_posts either (it skipped the feed rule; 20261008100000_security_hardening)');
select is(has_function_privilege('authenticated', 'public.get_follow_data(uuid, uuid)', 'execute'),
  true, 'signed in: get_follow_data');
select * from finish();
rollback;
