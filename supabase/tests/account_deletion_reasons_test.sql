-- Why people delete their account, and what is kept afterwards
-- (20261013100000_account_deletion_reasons; owner, 2026-10-13: "only keep what we are allowed").
-- * a person says why just before deleting (set_account_deletion_reason): your own only, one of
--   the listed reasons, their own words only with "Something else", 180 characters at most
-- * when the profile goes, one row is kept in account_deletions: the reason, their words, roughly
--   how old the account was and whether it had ever posted. No column says who it was
-- * a deletion with no reason (an older app, staff) is kept as "not_given"; a reason left over
--   from an earlier try (older than an hour) is not used
-- * the Slack message is built from that row alone, and their words can't ping or link anything
-- * the app can read and write neither table; PostHog's reader sees the daily counts, never the words
-- Every check reads only this test's own people, as a stranger with a fresh account would call it.
begin;
select plan(50);

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-000000de1e' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.signed_out() returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', '{}', true);
$$;
create function pg_temp.pending(p text) returns text language sql as $$
  select reason || coalesce(': ' || note, '')
  from public.account_deletion_reasons where user_id = pg_temp.uid(p)
$$;
-- Deleting an account, and the row kept for that deletion (the one that wasn't there before it).
create temp table seen (id uuid primary key);
create function pg_temp.remove(p text) returns void language sql as $$
  insert into seen select id from public.account_deletions on conflict do nothing;
  delete from auth.users where id = pg_temp.uid(p);
$$;
create function pg_temp.kept() returns public.account_deletions language sql as $$
  select d.* from public.account_deletions d where d.id not in (select id from seen)
$$;

-- a..d differ in age and posting; e gives no reason; f's reason is from an earlier try;
-- s is a stranger with a fresh account; n is signed in with no profile yet.
insert into auth.users (id, email)
select pg_temp.uid(c), 'del-why-' || c || '@example.invalid'
from unnest(array['a','b','c','d','e','f','s','n']) c;
insert into public.profiles (id, username, timezone, created_at, has_posted_before) values
  (pg_temp.uid('a'), 'delwhy_a', 'Europe/London', now() - interval '2 hours', false),
  (pg_temp.uid('b'), 'delwhy_b', 'Europe/London', now() - interval '3 days', true),
  (pg_temp.uid('c'), 'delwhy_c', 'Europe/London', now() - interval '20 days', false),
  (pg_temp.uid('d'), 'delwhy_d', 'Europe/London', now() - interval '90 days', true),
  (pg_temp.uid('e'), 'delwhy_e', 'Europe/London', now() - interval '3 days', false),
  (pg_temp.uid('f'), 'delwhy_f', 'Europe/London', now() - interval '3 days', false),
  (pg_temp.uid('s'), 'delwhy_s', 'Europe/London', now(), false);

create temp table before_counts as
  select count(*)::int as kept from public.account_deletions;

-- 1. What is kept, and who may touch it.
select is(
  (select array_agg(column_name::text order by ordinal_position)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'account_deletions'),
  array['id', 'deleted_at', 'reason', 'note', 'account_age', 'had_posted'],
  'the kept row has no column that says who it was');
select ok(not has_table_privilege('authenticated', 'public.account_deletions', 'SELECT')
          and not has_table_privilege('authenticated', 'public.account_deletions', 'INSERT')
          and not has_table_privilege('authenticated', 'public.account_deletions', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.account_deletions', 'DELETE'),
  'the app can neither read nor write the kept rows');
select ok(not has_table_privilege('authenticated', 'public.account_deletion_reasons', 'SELECT')
          and not has_table_privilege('authenticated', 'public.account_deletion_reasons', 'INSERT')
          and not has_table_privilege('authenticated', 'public.account_deletion_reasons', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.account_deletion_reasons', 'DELETE'),
  'nor the reasons waiting with an account');
select ok(not has_table_privilege('anon', 'public.account_deletions', 'SELECT')
          and not has_table_privilege('anon', 'public.account_deletions', 'INSERT')
          and not has_table_privilege('anon', 'public.account_deletion_reasons', 'SELECT')
          and not has_table_privilege('anon', 'public.account_deletion_reasons', 'INSERT'),
  'nor can a signed-out visitor');
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.account_deletions'::regclass,
                         'public.account_deletion_reasons'::regclass)),
  'row level security is on for both');
select ok(has_function_privilege('authenticated', 'public.set_account_deletion_reason(text, text)', 'execute')
          and not has_function_privilege('anon', 'public.set_account_deletion_reason(text, text)', 'execute')
          and not has_function_privilege('public', 'public.set_account_deletion_reason(text, text)', 'execute'),
  'set_account_deletion_reason: signed-in only');
select is((select string_agg(pg_get_function_identity_arguments(oid), ' | ')
           from pg_proc where pronamespace = 'public'::regnamespace
             and proname = 'set_account_deletion_reason'),
  'p_reason text, p_note text',
  'it takes the reason and the words only: there is no user id to pass');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=public'])
           from pg_proc where pronamespace = 'public'::regnamespace
             and proname in ('set_account_deletion_reason', 'record_account_deletion',
                             'notify_account_deletion')),
  'the three that write run as their owner with a fixed search path');
select ok(not has_function_privilege('authenticated', 'public.record_account_deletion()', 'execute')
          and not has_function_privilege('authenticated', 'public.notify_account_deletion()', 'execute')
          and not has_function_privilege('authenticated', 'public.account_deletion_slack_text(text, text, text, boolean)', 'execute')
          and not has_function_privilege('anon', 'public.account_deletion_slack_text(text, text, text, boolean)', 'execute'),
  'the keeping and the Slack message are the server''s own: the app cannot call them');

-- 2. Signed out is refused.
select pg_temp.signed_out();
select throws_ok($$select public.set_account_deletion_reason('not_using', null)$$, '42501',
  'not signed in', 'signed out: no reason can be left');
reset role;
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select public.set_account_deletion_reason('not_using', null)$$, '42501', null,
  'the signed-out role cannot call it at all');
reset role;

-- 3. The reason: one from the list a person can pick.
select pg_temp.as_user('a');
select lives_ok($$select public.set_account_deletion_reason('not_using', null)$$,
  'a listed reason is taken');
select throws_ok($$select public.set_account_deletion_reason('because', null)$$, '22023',
  'unknown reason', 'a reason that is not on the list is refused');
select throws_ok($$select public.set_account_deletion_reason(null, null)$$, '22023',
  'unknown reason', 'and so is none at all');
select throws_ok($$select public.set_account_deletion_reason('not_given', null)$$, '22023',
  'unknown reason', '"not_given" is the server''s own word: nobody can pick it');
reset role;
select is(pg_temp.pending('a'), 'not_using', 'a refused reason leaves the earlier one in place');

-- 4. Their own words: only with "Something else", tidied, 180 at most.
select pg_temp.as_user('a');
select lives_ok($$select public.set_account_deletion_reason('privacy', 'too many people can see me')$$,
  'words sent with another reason are accepted');
reset role;
select is(pg_temp.pending('a'), 'privacy', 'but not kept: words go with "Something else" only');
select pg_temp.as_user('a');
select lives_ok(
  $$select public.set_account_deletion_reason('other', E'  It   got\n\nboring\t after a ' || U&'\200B' || E'week  ')$$,
  'words with "Something else" are taken');
reset role;
select is(pg_temp.pending('a'), 'other: It got boring after a week',
  'trimmed, on one line, invisible characters out, and it replaces the earlier answer');
select pg_temp.as_user('a');
select lives_ok($$select public.set_account_deletion_reason('other', repeat('a', 180))$$,
  '180 characters are taken');
select lives_ok($$select public.set_account_deletion_reason('other', repeat(U&'\+01F4AA', 180))$$,
  '180 emoji are taken: an emoji counts once');
select throws_ok($$select public.set_account_deletion_reason('other', repeat('b', 181))$$, '22023',
  'note is too long: 180 characters at most', '181 characters are refused, with the reason');
select lives_ok($$select public.set_account_deletion_reason('other', E' \n\t ')$$,
  '"Something else" with only spaces is taken');
reset role;
select is(pg_temp.pending('a'), 'other', 'as "Something else" with no words');
select is((select count(*)::int from public.account_deletion_reasons where user_id = pg_temp.uid('a')), 1,
  'however often they answer, one answer waits with the account');

-- 5. A stranger with a fresh account can only ever leave their own.
select pg_temp.as_user('s');
select lives_ok($$select public.set_account_deletion_reason('new_account', null)$$,
  'a stranger leaves a reason');
reset role;
select is(pg_temp.pending('s'), 'new_account', 'it waits with their own account');
select is(pg_temp.pending('a'), 'other', 'and nobody else''s changed');
select pg_temp.as_user('s');
select throws_ok($$select reason from public.account_deletion_reasons$$, '42501', null,
  'a stranger cannot read anyone''s waiting reason');
select throws_ok(
  $$insert into public.account_deletion_reasons (user_id, reason) values (pg_temp.uid('b'), 'privacy')$$,
  '42501', null, 'nor write one for someone else');
select throws_ok($$select note from public.account_deletions$$, '42501', null,
  'nor read why other people left');
select throws_ok(
  $$insert into public.account_deletions (reason, account_age, had_posted) values ('privacy', 'under_a_day', false)$$,
  '42501', null, 'nor make up a deletion');
reset role;
select pg_temp.as_user('n');
select throws_ok($$select public.set_account_deletion_reason('not_using', null)$$, '42501',
  'not allowed', 'signed in with no profile: there is nothing to leave a reason on');
reset role;

-- 6. Deleting the account keeps one row, with nothing that says who.
select pg_temp.as_user('a');
select public.set_account_deletion_reason('other', 'My friends <!channel> & I left');
reset role;
select lives_ok($$select pg_temp.remove('a')$$, 'the account can be deleted');
select is((select count(*)::int from public.account_deletions) - (select kept from before_counts), 1,
  'one row is kept for it');
select is(
  (select reason || ' | ' || note || ' | ' || account_age || ' | ' || had_posted from pg_temp.kept()),
  'other | My friends <!channel> & I left | under_a_day | false',
  'the reason, their words, how old the account was and whether it had posted');
select ok(
  (select row_to_json(k)::text from pg_temp.kept() k) !~* ('delwhy_a|del-why-a|' || pg_temp.uid('a')::text),
  'no username, email or account id is in it');
select is((select count(*)::int from public.account_deletion_reasons where user_id = pg_temp.uid('a')), 0,
  'the waiting answer went with the account');

-- 7. How old the account was, in four rough steps, and whether it ever posted.
select pg_temp.as_user('b');
select public.set_account_deletion_reason('friends_not_here', null);
reset role;
select pg_temp.remove('b');
select is((select reason || ' | ' || account_age || ' | ' || had_posted from pg_temp.kept()),
  'friends_not_here | under_a_week | true', 'three days old, had posted');
select pg_temp.as_user('c');
select public.set_account_deletion_reason('rather_not_say', null);
reset role;
select pg_temp.remove('c');
select is((select reason || ' | ' || account_age from pg_temp.kept()),
  'rather_not_say | under_a_month', 'twenty days old');
select pg_temp.as_user('d');
select public.set_account_deletion_reason('too_much_pressure', null);
reset role;
select pg_temp.remove('d');
select is((select reason || ' | ' || account_age || ' | ' || had_posted from pg_temp.kept()),
  'too_much_pressure | over_a_month | true', 'ninety days old, had posted');

-- 8. No reason, or one left over from an earlier try, is kept as "not_given".
select pg_temp.remove('e');
select is((select reason || ' | ' || coalesce(note, 'no words') from pg_temp.kept()),
  'not_given | no words', 'deleted with no reason (an older app, or staff): kept as not given');
select pg_temp.as_user('f');
select public.set_account_deletion_reason('other', 'said two hours ago');
reset role;
update public.account_deletion_reasons set created_at = now() - interval '2 hours'
where user_id = pg_temp.uid('f');
select pg_temp.remove('f');
select is((select reason || ' | ' || coalesce(note, 'no words') from pg_temp.kept()),
  'not_given | no words', 'a reason from an earlier try is not passed off as this deletion''s');

-- 9. The Slack message: built from the kept row alone.
select is(
  public.account_deletion_slack_text('not_using', null, 'under_a_week', true),
  E'Someone deleted their Mahi account.\n• Why: I don’t use it enough\n• Had the account: less than a week\n• Posted a workout: yes',
  'a picked reason reads as the words the person tapped');
select is(
  public.account_deletion_slack_text('other', 'My friends <!channel> & I left', 'over_a_month', false),
  E'Someone deleted their Mahi account.\n• Why: Something else\n• In their words: “My friends &lt;!channel&gt; &amp; I left”\n• Had the account: more than a month\n• Posted a workout: no',
  'their words are quoted, and cannot ping the channel or make a link');
select is(
  public.account_deletion_slack_text('not_given', null, 'under_a_day', false),
  E'Someone deleted their Mahi account.\n• Why: No reason given\n• Had the account: less than a day\n• Posted a workout: no',
  'no reason reads as no reason given');
select ok(
  public.account_deletion_slack_text('other', 'x', 'under_a_day', false) !~* 'delwhy|@',
  'the message never names anyone');

-- 10. The numbers PostHog reads: counts per day and reason, never the words.
select ok(has_table_privilege('posthog_reader', 'stats.account_deletions_daily', 'SELECT')
          and not has_table_privilege('posthog_reader', 'public.account_deletions', 'SELECT')
          and not has_table_privilege('posthog_reader', 'public.account_deletion_reasons', 'SELECT'),
  'PostHog''s reader sees the daily counts and neither table');
select ok(
  (select deletions >= 2 from stats.account_deletions_daily
   where day = (now() at time zone 'UTC')::date and reason = 'not_given')
  and (select deletions >= 1 from stats.account_deletions_daily
       where day = (now() at time zone 'UTC')::date and reason = 'friends_not_here')
  and not exists (select 1 from information_schema.columns
                  where table_schema = 'stats' and table_name = 'account_deletions_daily'
                    and column_name = 'note'),
  'today''s deletions are counted by reason, with no words in the counts');

select * from finish();
rollback;
