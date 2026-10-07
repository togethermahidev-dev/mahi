-- Find your mates from your contacts (owner, 2026-10-07): the phone sends SHA-256 hashes of its
-- contacts' numbers (E.164) and emails (lowercased), never the contacts themselves; the server
-- answers with the Mahi accounts those hashes belong to, and never hands back a phone or email.
-- Migration: 20261007220000_contact_match.
begin;
select plan(34);

update public.app_config set contact_match_max_hashes = 2000, contact_match_calls_per_hour = 10;

-- A looks for mates. B has a phone typed the local way, C an email in capitals, D is banned,
-- A blocked E, F blocked A, G has nothing to find.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c701', 'cm-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000c702', 'cm-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000c703', 'C@Example.com'),
  ('00000000-0000-0000-0000-00000000c704', 'cm-d@example.invalid'),
  ('00000000-0000-0000-0000-00000000c705', 'cm-e@example.invalid'),
  ('00000000-0000-0000-0000-00000000c706', 'cm-f@example.invalid'),
  ('00000000-0000-0000-0000-00000000c707', 'cm-g@example.invalid');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Everyone signs up the way the app does: the phone number goes onto profiles as typed.
select pg_temp.as_user('00000000-0000-0000-0000-00000000c701');
insert into public.profiles (id, username, contact_number) values ('00000000-0000-0000-0000-00000000c701', 'cm_a', '+447700900999');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c702');
insert into public.profiles (id, username, display_name, contact_number) values ('00000000-0000-0000-0000-00000000c702', 'cm_b', 'Bea', '07700 900111');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c703');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-00000000c703', 'cm_c');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c704');
insert into public.profiles (id, username, contact_number) values ('00000000-0000-0000-0000-00000000c704', 'cm_d', '+44 7700 900222');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c705');
insert into public.profiles (id, username, contact_number) values ('00000000-0000-0000-0000-00000000c705', 'cm_e', '+447700900333');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c706');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-00000000c706', 'cm_f');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c707');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-00000000c707', 'cm_g');
reset role;

update public.profiles set is_banned = true where id = '00000000-0000-0000-0000-00000000c704';
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-00000000c705'),
  ('00000000-0000-0000-0000-00000000c706', '00000000-0000-0000-0000-00000000c701');
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-00000000c702'),
  ('00000000-0000-0000-0000-00000000c703', '00000000-0000-0000-0000-00000000c701');

-- 1. One way to write a number and one hash, the same as the app's (ui/src/lib/contactMatch.ts).
select is(public.normalise_phone('07700 900111'), '+447700900111', 'a local UK number gets +44');
select is(public.normalise_phone('+44 (0)7700 900111'), '+447700900111', 'the (0) people write after +44 goes');
select is(public.normalise_phone('+44 07700 900111'), '+447700900111', 'so does a 0 straight after +44');
select is(public.normalise_phone('0044 7700 900111'), '+447700900111', '00 means +');
select is(public.normalise_phone('447700900111'), '+447700900111', 'a long number without + is taken as international');
select is(public.normalise_phone('7700900111'), '+447700900111', 'a short one without 0 is taken as UK');
select is(public.normalise_phone('+1 (212) 555-1234'), '+12125551234', 'other countries keep their code');
select is(public.normalise_phone('call me'), null, 'no number, no answer');
select is(public.normalise_phone('12345'), null, 'too short to be a phone number');
select is(public.contact_hash('+447700900111'),
  '5c72716d8852e555b8ed05b0d1b12ed5c12c3dec8cb609dfb99b77e6c592e5cb',
  'the hash is SHA-256 in lower-case hex');

-- 2. Nobody can read the hashes, or call in signed out.
select ok(not has_table_privilege('authenticated', 'public.contact_hashes', 'SELECT')
          and not has_table_privilege('anon', 'public.contact_hashes', 'SELECT'),
  'the stored hashes are never readable from the app');
select ok(pg_get_function_result('public.match_contacts(text[])'::regprocedure) !~* '(email|phone|contact|hash text)',
  'what comes back has no phone or email in it');
set local role anon;
select throws_ok($$select * from public.match_contacts(array['x'])$$, '42501', null,
  'signed out: no matching');
reset role;

-- 3. A sends the hashes of four numbers and three emails from the phone's contacts.
create table pg_temp.sent as
select array[
  public.contact_hash('+447700900111'),   -- B
  public.contact_hash('c@example.com'),   -- C
  public.contact_hash('+447700900222'),   -- D, banned
  public.contact_hash('+447700900333'),   -- E, blocked by A
  public.contact_hash('cm-f@example.invalid'), -- F, who blocked A
  public.contact_hash('+447700900999'),   -- A's own number
  public.contact_hash('nobody@example.invalid')
] as hashes;
grant select on pg_temp.sent to authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c701');
create table pg_temp.found as select * from public.match_contacts((select hashes from pg_temp.sent));
select is((select array_agg(username order by username) from pg_temp.found), array['cm_b', 'cm_c'],
  'B by phone and C by email; not A, the banned, or anyone blocked either way');
select is((select display_name from pg_temp.found where username = 'cm_b'), 'Bea', 'with their name');
select ok((select is_following and not follows_you from pg_temp.found where username = 'cm_b'),
  'A already follows B');
select ok((select not is_following and follows_you from pg_temp.found where username = 'cm_c'),
  'C follows A');
select is((select matched_hashes from pg_temp.found where username = 'cm_b'),
  array[public.contact_hash('+447700900111')], 'and which of A''s own hashes found them');
select is((select count(*) from public.match_contacts(array[]::text[]))::int, 0, 'nothing sent, nothing found');
select is((select count(*) from public.match_contacts(array['not a hash', null]))::int, 0,
  'anything that isn''t a hash is ignored');
select throws_ok(
  $$select * from public.match_contacts(array(select md5(i::text) || md5(i::text) from generate_series(1, 2001) i))$$,
  '22023', 'contact match: too many hashes', 'at most 2000 hashes a call');

-- 4. Changes count straight away.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c702');
update public.profiles set contact_number = '+44 7700 900444' where id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-00000000c701');
select is((select count(*) from public.match_contacts(array[public.contact_hash('+447700900111')]))::int, 0,
  'B changed number: the old one finds nobody');
select is((select username from public.match_contacts(array[public.contact_hash('+447700900444')])), 'cm_b',
  'the new one finds B');
reset role;
update auth.users set email = 'new-c@example.invalid' where id = '00000000-0000-0000-0000-00000000c703';
select pg_temp.as_user('00000000-0000-0000-0000-00000000c701');
select is((select count(*) from public.match_contacts(array[public.contact_hash('c@example.com')]))::int, 0,
  'C changed email: the old one finds nobody');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c707');
select is((select count(*) from public.match_contacts(array[public.contact_hash('+447700900444')]))::int, 1,
  'G finds B too');
reset role;

-- 5. Ten tries an hour each; the eleventh is refused and changes nothing.
select ok(not has_table_privilege('authenticated', 'public.contact_match_calls', 'SELECT'),
  'nobody can read the tries table from the app');
select is((select count(*) from public.contact_match_calls
           where user_id = '00000000-0000-0000-0000-00000000c701')::int, 6,
  'A''s six tries so far are counted (the refused one is not)');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c701');
select lives_ok($$select * from public.match_contacts(array[public.contact_hash('x')])$$, 'try 7');
select lives_ok($$select * from public.match_contacts(array[public.contact_hash('x')])$$, 'try 8');
select lives_ok($$select * from public.match_contacts(array[public.contact_hash('x')])$$, 'try 9');
select lives_ok($$select * from public.match_contacts(array[public.contact_hash('x')])$$, 'try 10');
select throws_ok($$select * from public.match_contacts(array[public.contact_hash('x')])$$,
  '22023', 'contact match: too many tries', 'try 11 is refused');
reset role;
update public.contact_match_calls set called_at = now() - interval '61 minutes'
where user_id = '00000000-0000-0000-0000-00000000c701';
select pg_temp.as_user('00000000-0000-0000-0000-00000000c701');
select lives_ok($$select * from public.match_contacts(array[public.contact_hash('x')])$$,
  'an hour later A can look again');
reset role;

-- 6. Banned people can't look.
select pg_temp.as_user('00000000-0000-0000-0000-00000000c704');
select throws_ok($$select * from public.match_contacts(array[public.contact_hash('x')])$$, '42501', null,
  'a banned account can''t match');
reset role;

select * from finish();
rollback;
