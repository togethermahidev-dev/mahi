-- Who and where an invite went (owner, 2026-10-07): "Your invites" rows said "Tag invite ·
-- Waiting · Code …" three times over and "doesn't say who or where or how". The app records each
-- share that happened (how, and to whom when it knows), and the list hands it back to the inviter
-- only.
-- Migration: 20261007290000_invite_sent_to.
begin;
select plan(27);

update public.app_config set invite_links_enabled = true, tags_required = true, tag_count = 3,
  max_open_invites = 10, quiet_start = '00:00', quiet_end = '00:00';

-- A invites. B is someone else.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000fc201', 'st-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000fc202', 'st-b@example.invalid');
insert into public.profiles (id, username, display_name, timezone) values
  ('00000000-0000-0000-0000-0000000fc201', 'st_a', null, 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fc202', 'st_b', null, 'Europe/London');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create table pg_temp.ids (name text primary key, token text);
grant all on pg_temp.ids to authenticated;
create function pg_temp.token(p_name text) returns text language sql as $$
  select token from pg_temp.ids where name = p_name;
$$;

-- 1. Two links: one for a mate, one for a tag slot.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fc201');
insert into pg_temp.ids select 'mate', public.make_mate_invite() ->> 'token';
insert into pg_temp.ids select 'slot', public.make_invite_link() ->> 'token';

-- 2. Nothing recorded yet: the new fields are empty, the old ones are all still there.
select ok((select sent_via is null and sent_to_name is null and sent_to_phone is null
                  and post_id is null and post_created_at is null
           from public.get_my_invites() where token = pg_temp.token('mate')),
  'a link never recorded as sent says nothing about where it went');
select ok((select token is not null and code is not null and url is not null and kind = 'mate'
                  and status = 'waiting' and created_at is not null and expires_at is not null
                  and last_sent_at is not null and send_count = 1 and joined is null
                  and can_resend is not null and server_now is not null
           from public.get_my_invites() where token = pg_temp.token('mate')),
  'every field the list had before is still there');

-- 3. Sent to a contact by text: how, their name and number.
select is(
  (select public.record_invite_sent(pg_temp.token('mate'), 'contact', '  Sam Lee ', '+447700900123')
          -> 'invite' ->> 'sent_to_name'),
  'Sam Lee', 'recording a send hands back the row, name tidied');
select is(
  (select jsonb_build_array(sent_via, sent_to_name, sent_to_phone)
   from public.get_my_invites() where token = pg_temp.token('mate')),
  '["contact", "Sam Lee", "+447700900123"]'::jsonb, 'the list says how and to whom');
select is(
  (select public.record_invite_sent(pg_temp.token('mate'), 'contact', 'Sam Lee', '+447700900123')
          -> 'invite' ->> 'sent_via'),
  'contact', 'recording the same send again is safe');
select is((select send_count from public.get_my_invites() where token = pg_temp.token('mate')), 1,
  'recording a send never counts as a resend');

-- 4. Shared on WhatsApp: no name or number is known.
select lives_ok($$select public.record_invite_sent(pg_temp.token('slot'), 'whatsapp', null, null)$$,
  'a share with nobody named');
select is(
  (select jsonb_build_array(sent_via, sent_to_name, sent_to_phone)
   from public.get_my_invites() where token = pg_temp.token('slot')),
  '["whatsapp", null, null]'::jsonb, 'shared on WhatsApp');
select lives_ok($$select public.record_invite_sent(pg_temp.token('slot'), 'share', '', ' ')$$,
  'blank name and number are taken as none');
select is((select sent_via from public.get_my_invites() where token = pg_temp.token('slot')),
  'share', 'the latest send is the one shown');
select lives_ok($$select public.record_invite_sent(pg_temp.token('slot'), 'messages', null, null)$$,
  'Messages');
select lives_ok($$select public.record_invite_sent(pg_temp.token('slot'), 'copy', null, null)$$,
  'a copied link');

-- 5. Checks: only these ways, a short name, a real international number.
select throws_ok($$select public.record_invite_sent(pg_temp.token('slot'), 'email', null, null)$$,
  '22023', 'record_invite_sent: bad via', 'an unknown way is refused');
select throws_ok($$select public.record_invite_sent(pg_temp.token('slot'), null, null, null)$$,
  '22023', 'record_invite_sent: bad via', 'no way at all is refused');
select throws_ok(
  format('select public.record_invite_sent(%L, %L, %L, null)', pg_temp.token('slot'), 'share', repeat('x', 61)),
  '22023', 'record_invite_sent: name too long', 'a name over 60 characters is refused');
select throws_ok($$select public.record_invite_sent(pg_temp.token('slot'), 'contact', 'Sam', '07700900123')$$,
  '22023', 'record_invite_sent: bad phone', 'a number not written the international way is refused');
select throws_ok($$select public.record_invite_sent(pg_temp.token('slot'), 'contact', 'Sam', null)$$,
  '22023', 'record_invite_sent: bad phone', 'a contact send needs the number');
select is((select sent_via from public.get_my_invites() where token = pg_temp.token('slot')),
  'copy', 'a refused record changes nothing');
reset role;

-- 6. Only A records A's links, and only A sees the number.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fc202');
select throws_ok($$select public.record_invite_sent(pg_temp.token('mate'), 'share', null, null)$$,
  '22023', 'that invite is not valid', 'B can''t record a send of A''s link');
select is((select count(*)::int from public.get_my_invites()), 0, 'B never sees A''s invites');
select throws_ok($$select sent_to_phone from public.invites$$, '42501', null,
  'nobody reads the table directly');
reset role;
set local role anon;
select throws_ok($$select public.record_invite_sent('x', 'share', null, null)$$, '42501', null,
  'signed out: no recording');
reset role;
select ok(not (public.get_invite_preview(pg_temp.token('mate')) ?| array['sent_to_phone', 'sent_to_name', 'sent_via']),
  'the public invite page never shows who it was sent to');

-- 7. A tag link posted with: the post and when, from its slot.
insert into public.posts (id, user_id, image_url, streak_day)
values ('00000000-0000-0000-0000-0000000fc2a1', '00000000-0000-0000-0000-0000000fc201', 'x', 1);
update public.tag_challenges set post_id = '00000000-0000-0000-0000-0000000fc2a1'
where id = (select challenge_id from public.invites where token = pg_temp.token('slot'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000fc201');
select is(
  (select jsonb_build_array(post_id, post_created_at)
   from public.get_my_invites() where token = pg_temp.token('slot')),
  (select jsonb_build_array(id, created_at) from public.posts
   where id = '00000000-0000-0000-0000-0000000fc2a1'),
  'a tag link says which post it went with, and when');
select ok((select post_id is null from public.get_my_invites() where token = pg_temp.token('mate')),
  'a link for a mate has no post');
reset role;

-- 8. Who may call it.
select ok(has_function_privilege('authenticated', 'public.record_invite_sent(text, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.record_invite_sent(text, text, text, text)', 'execute'),
  'signed in only');
select ok(not has_function_privilege('authenticated', 'public.invite_rows(uuid, text)', 'execute'),
  'the internal list stays internal');

select * from finish();
rollback;
