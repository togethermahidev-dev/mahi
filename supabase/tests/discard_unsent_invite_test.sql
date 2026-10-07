-- "Invite a mate", then the share sheet is closed without sending (owner, 2026-10-07): the link
-- made on tap is taken back, so it never shows in "Your invites" nor counts towards the cap.
-- Migration: 20261007295000_discard_unsent_invite.
begin;
select plan(9);

update public.app_config set invite_links_enabled = true, max_open_invites = 10;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000fd101', 'disc-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000fd102', 'disc-b@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000fd101', 'disc_a', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fd102', 'disc_b', 'Europe/London');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create table pg_temp.ids (name text primary key, token text);
grant all on pg_temp.ids to authenticated;
create function pg_temp.token(p_name text) returns text language sql as $$
  select token from pg_temp.ids where name = p_name;
$$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000fd101');
insert into pg_temp.ids select 'unsent', public.make_mate_invite() ->> 'token';
insert into pg_temp.ids select 'sent', public.make_mate_invite() ->> 'token';
select public.record_invite_sent(pg_temp.token('sent'), 'share', null, null);

-- 1. Someone else can't take your link back.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fd102');
select is(public.discard_unsent_invite(pg_temp.token('unsent')), false,
  'another person cannot discard your link');
reset role;
select is((select count(*)::int from public.invites where token = pg_temp.token('unsent')), 1,
  'so it is still there');

-- 2. Your own link that never went anywhere is gone, and frees its place under the cap.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fd101');
select is(public.discard_unsent_invite(pg_temp.token('unsent')), true,
  'a link that was never sent is taken back');
reset role;
select is((select count(*)::int from public.invites where token = pg_temp.token('unsent')), 0,
  'it no longer exists');
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fd101'), 1,
  'only the sent link counts as open');

-- 3. A link that was sent stays; asking twice is harmless.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fd101');
select is(public.discard_unsent_invite(pg_temp.token('sent')), false,
  'a link that went out is never taken back');
select is(public.discard_unsent_invite(pg_temp.token('unsent')), false,
  'asking again does nothing');
reset role;
select is((select count(*)::int from public.invites where token = pg_temp.token('sent')), 1,
  'the sent link is still there');

-- 4. Signed out: no.
set local role anon;
select throws_ok(format('select public.discard_unsent_invite(%L)', 'x'), '42501', null,
  'signed out: no discarding');
reset role;

select * from finish();
rollback;
