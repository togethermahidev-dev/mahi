-- Your invites (owner, 2026-10-07): see who you've invited and who joined, send a link again
-- after a day (at most 3 times), and cancel a link nobody has used.
-- Migration: 20261007210000_my_invites.
begin;
select plan(47);

update public.app_config set invite_links_enabled = true, tags_required = true, tag_count = 3,
  max_open_invites = 10, quiet_start = '00:00', quiet_end = '00:00';

-- A invites. B is someone else. N and M are brand new.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000fb201', 'mi-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000fb202', 'mi-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000fb203', 'mi-n@example.invalid'),
  ('00000000-0000-0000-0000-0000000fb204', 'mi-m@example.invalid');
insert into public.profiles (id, username, display_name, timezone) values
  ('00000000-0000-0000-0000-0000000fb201', 'mi_a', null, 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fb202', 'mi_b', null, 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fb203', 'mi_n', 'Sam N', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fb204', 'mi_m', null, 'Europe/London');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create table pg_temp.ids (name text primary key, token text);
grant all on pg_temp.ids to authenticated;
create function pg_temp.token(p_name text) returns text language sql as $$
  select token from pg_temp.ids where name = p_name;
$$;
-- One of A's invites, as A's list shows it.
create function pg_temp.row_of(p_name text) returns jsonb language sql as $$
  select to_jsonb(r) from public.invite_rows('00000000-0000-0000-0000-0000000fb201', pg_temp.token(p_name)) r;
$$;
-- Pretend a day and a bit has passed since it was last sent.
create function pg_temp.age(p_name text) returns void language sql as $$
  update public.invites set last_sent_at = now() - interval '25 hours' where token = pg_temp.token(p_name);
$$;

-- 1. A makes a link for a mate and a tag slot link.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
insert into pg_temp.ids select 'mate', public.make_mate_invite() ->> 'token';
insert into pg_temp.ids select 'slot', public.make_invite_link() ->> 'token';
reset role;
update public.invites set created_at = now() - interval '1 minute' where token = pg_temp.token('mate');

-- 2. The list: A's own links, newest first, each saying where it's at.
set local role anon;
select throws_ok($$select * from public.get_my_invites()$$, '42501', null, 'signed out: no list');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select is(
  (select array_agg(kind order by ord) from public.get_my_invites() with ordinality t(token, code, url, kind, status, created_at, expires_at, last_sent_at, send_count, joined, can_resend, resend_at, server_now, ord)),
  array['tag', 'mate'], 'newest first: the tag link, then the link for a mate');
select is((select status from public.get_my_invites() where token = pg_temp.token('mate')), 'waiting',
  'a link nobody used yet is waiting');
select is((select url from public.get_my_invites() where token = pg_temp.token('mate')),
  (select invite_base_url from public.app_config) || pg_temp.token('mate'), 'it has its link');
select ok((select send_count = 1 and last_sent_at = created_at and joined is null
           from public.get_my_invites() where token = pg_temp.token('slot')),
  'sent once, nobody joined yet');
select ok((select not can_resend and resend_at = last_sent_at + interval '24 hours'
           from public.get_my_invites() where token = pg_temp.token('mate')),
  'it can be sent again a day after it was sent');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb202');
select is((select count(*)::int from public.get_my_invites()), 0, 'B never sees A''s invites');

-- 3. Only A can send A's link again or cancel it.
select throws_ok($$select public.resend_invite(pg_temp.token('mate'))$$, '22023',
  'that invite is not valid', 'B can''t send A''s link again');
select throws_ok($$select public.cancel_invite(pg_temp.token('mate'))$$, '22023',
  'that invite is not valid', 'B can''t cancel A''s link');
reset role;

-- 4. Too soon: nothing changes, and it says why (asking again is safe).
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select is(
  (select jsonb_build_object('resent', r -> 'resent', 'reason', r -> 'reason',
                             'send_count', r -> 'invite' -> 'send_count')
   from public.resend_invite(pg_temp.token('mate')) r),
  '{"resent": false, "reason": "resend: too soon", "send_count": 1}'::jsonb,
  'within a day: not sent again, with the reason');
reset role;

-- 5. After a day: sent again, good for another 7 days.
update public.invites set expires_at = now() + interval '1 day' where token = pg_temp.token('mate');
select pg_temp.age('mate');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select is((public.resend_invite(pg_temp.token('mate')) ->> 'resent')::boolean, true, 'sent again after a day');
reset role;
select ok((select send_count = 2 and last_sent_at = now() and expires_at = now() + interval '7 days'
           from public.invites where token = pg_temp.token('mate')),
  'counted once, last sent now, open for 7 more days');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select is((public.resend_invite(pg_temp.token('mate')) ->> 'resent')::boolean, false,
  'tapping again straight away does nothing');
reset role;
select is((select send_count from public.invites where token = pg_temp.token('mate')), 2,
  'and is never counted twice');

-- 6. At most 3 times.
update public.invites set send_count = 4 where token = pg_temp.token('mate');
select pg_temp.age('mate');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select throws_ok($$select public.resend_invite(pg_temp.token('mate'))$$, '22023',
  'resend: limit reached', 'after 3 times, no more');
reset role;
select ok((select not (r ->> 'can_resend')::boolean and r -> 'resend_at' = 'null'::jsonb
           from pg_temp.row_of('mate') r),
  'the list says it can''t be sent again');
update public.invites set send_count = 1 where token = pg_temp.token('mate');

-- 7. A link that ran out can be sent again: it works again.
update public.invites set expires_at = now() - interval '1 hour' where token = pg_temp.token('mate');
select pg_temp.age('mate');
select is(pg_temp.row_of('mate') ->> 'status', 'expired', 'a link that ran out says expired');
select ok((pg_temp.row_of('mate') ->> 'can_resend')::boolean, 'and can be sent again');
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fb201'), 1,
  'it no longer counts as open (the tag slot does)');
-- Not over the cap.
update public.app_config set max_open_invites = 1;
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select throws_ok($$select public.resend_invite(pg_temp.token('mate'))$$, '22023',
  'too many open invites', 'reviving it can''t go past the cap');
reset role;
select is(pg_temp.row_of('mate') ->> 'status', 'expired', 'and nothing changed');
update public.app_config set max_open_invites = 10;
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select is((public.resend_invite(pg_temp.token('mate')) -> 'invite' ->> 'status'), 'waiting',
  'sent again: waiting once more');
reset role;
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fb201'), 2, 'and open again');

-- 8. A tag slot's link that was dropped and ran out, revived, counts as open.
update public.tag_challenges set cancelled_at = now()
where id = (select challenge_id from public.invites where token = pg_temp.token('slot'));
update public.invites set expires_at = now() - interval '1 hour' where token = pg_temp.token('slot');
select pg_temp.age('slot');
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fb201'), 1, 'one open before');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select is((public.resend_invite(pg_temp.token('slot')) ->> 'resent')::boolean, true,
  'a dropped tag link can be sent again');
reset role;
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fb201'), 2,
  'a revived link counts as open');
select ok(not (public.get_invite_preview(pg_temp.token('slot')) ->> 'tag')::boolean,
  'it says no tag comes with it now');

-- 9. Cancel: the link stops working, and cancelling twice gives the same answer.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
insert into pg_temp.ids select 'c1', public.cancel_invite(pg_temp.token('mate'))::text;
insert into pg_temp.ids select 'c2', public.cancel_invite(pg_temp.token('mate'))::text;
reset role;
select is((pg_temp.token('c1'))::jsonb ->> 'cancelled', 'true', 'cancelled');
select is((pg_temp.token('c1'))::jsonb, (pg_temp.token('c2'))::jsonb, 'cancelling twice: same result');
select is(pg_temp.row_of('mate') ->> 'status', 'cancelled', 'the list says cancelled');
select ok(not (pg_temp.row_of('mate') ->> 'can_resend')::boolean
          and pg_temp.row_of('mate') -> 'resend_at' = 'null'::jsonb, 'and it can''t be sent again');
select ok(not (public.get_invite_preview(pg_temp.token('mate')) ->> 'open')::boolean,
  'the invite page says it''s closed');
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fb201'), 1,
  'it no longer counts as open');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb203');
select throws_ok($$select public.claim_invite(pg_temp.token('mate'))$$, '22023',
  'that invite has expired', 'nobody joins from a cancelled link (as from one that ran out)');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select throws_ok($$select public.resend_invite(pg_temp.token('mate'))$$, '22023',
  'resend: cancelled', 'a cancelled link can''t be sent again');
reset role;

-- 10. Cancelling a tag slot's link takes its slot back too.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
insert into pg_temp.ids select 'slot2', public.make_invite_link() ->> 'token';
reset role;
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fb201'), 2, 'the new slot is open');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select lives_ok($$select public.cancel_invite(pg_temp.token('slot2'))$$, 'A cancels the slot''s link');
reset role;
select ok((select c.cancelled_at is not null from public.tag_challenges c
           join public.invites i on i.challenge_id = c.id where i.token = pg_temp.token('slot2')),
  'its slot is taken back');
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fb201'), 1, 'and no longer open');

-- 11. Someone joins: the list says who; it can't be sent again or cancelled.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb203');
select lives_ok($$select public.claim_invite(pg_temp.token('slot'))$$, 'N joins from the revived link');
reset role;
select is(pg_temp.row_of('slot') ->> 'status', 'joined', 'the list says joined');
select is(pg_temp.row_of('slot') -> 'joined',
  '{"id": "00000000-0000-0000-0000-0000000fb203", "username": "mi_n", "display_name": "Sam N", "avatar_url": null}'::jsonb,
  'with who joined (profile only)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select throws_ok($$select public.resend_invite(pg_temp.token('slot'))$$, '22023',
  'resend: already joined', 'a used link can''t be sent again');
select throws_ok($$select public.cancel_invite(pg_temp.token('slot'))$$, '22023',
  'cancel: already joined', 'a used link can''t be cancelled');
reset role;

-- 12. The list covers the last 30 days.
update public.invites set created_at = now() - interval '31 days', last_sent_at = now() - interval '31 days'
where token = pg_temp.token('slot2');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fb201');
select is((select count(*)::int from public.get_my_invites()), 2, 'older than 30 days: not listed');
reset role;

-- 13. Who may call what.
select ok(not has_function_privilege('anon', 'public.resend_invite(text)', 'execute')
          and not has_function_privilege('anon', 'public.cancel_invite(text)', 'execute')
          and not has_function_privilege('anon', 'public.get_my_invites()', 'execute')
          and not has_function_privilege('authenticated', 'public.invite_rows(uuid, text)', 'execute'),
  'signed out: nothing; the row builder is internal');
select ok(has_function_privilege('authenticated', 'public.resend_invite(text)', 'execute')
          and has_function_privilege('authenticated', 'public.cancel_invite(text)', 'execute')
          and has_function_privilege('authenticated', 'public.get_my_invites()', 'execute'),
  'signed in: the three');

select * from finish();
rollback;
