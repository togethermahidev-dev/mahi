-- Two server functions nothing calls any more are gone (20261008160000_drop_dead_functions):
-- * get_feed_posts: the old feed read that skipped the feed rule (the app reads get_feed; revoked
--   from everyone by 20261008100000_security_hardening)
-- * format_wait: the old "45m" wording (pushes use format_duration since 20261006120000)
begin;
select plan(3);

select hasnt_function('public', 'get_feed_posts', array['integer', 'timestamp with time zone', 'uuid'],
  'the old unchecked feed read is gone');
select hasnt_function('public', 'format_wait', array['interval'],
  'the old wait wording is gone');
-- A plpgsql body naming either one would only fail when it runs, so check none is left.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~ '\m(get_feed_posts|format_wait)\M'),
  0, 'no server function still calls either one');

select * from finish();
rollback;
