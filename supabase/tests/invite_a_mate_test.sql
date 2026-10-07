-- Invite a mate any time (owner, 2026-10-07): a link made without a post, from the camera's
-- no-tag card. Joining from it makes the two follow each other and starts no tag. The inviter's
-- next post and the invite clean-up never cancel it; it counts towards max_open_invites.
-- Migration: 20261007190100_invite_a_mate.
begin;
select plan(20);

update public.app_config set invite_links_enabled = true, tags_required = true, tag_count = 3,
  max_open_invites = 10, quiet_start = '00:00', quiet_end = '00:00';

-- A has posted before and has no open tag. N and M are brand new. T has never posted.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000fa201', 'iam-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000fa202', 'iam-n@example.invalid'),
  ('00000000-0000-0000-0000-0000000fa203', 'iam-m@example.invalid'),
  ('00000000-0000-0000-0000-0000000fa204', 'iam-t@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000fa201', 'iam_a', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fa202', 'iam_n', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fa203', 'iam_m', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fa204', 'iam_t', 'Europe/London');
update public.profiles set has_posted_before = true where id = '00000000-0000-0000-0000-0000000fa201';
insert into storage.objects (bucket_id, name)
values ('posts', '00000000-0000-0000-0000-0000000fa201/a1.jpg');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create table pg_temp.ids (name text primary key, token text);
grant all on pg_temp.ids to authenticated;
create function pg_temp.token(p_name text) returns text language sql as $$
  select token from pg_temp.ids where name = p_name;
$$;

-- 1. No tag to answer: no tag slot, but an invite for a mate is fine.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa201');
select throws_ok($$select public.make_invite_link()$$, 'P0001', 'reactive posting: not tagged',
  'a tag slot still needs a tag to answer');
select lives_ok($$insert into pg_temp.ids select 'mate', public.make_mate_invite() ->> 'token'$$,
  'an invite for a mate can be made any time');
reset role;
select ok(
  (select i.code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' and i.challenge_id is null
          and i.inviter_id = '00000000-0000-0000-0000-0000000fa201'
   from public.invites i where i.token = pg_temp.token('mate')),
  'it is a link with a code and no tag behind it');
select is((select count(*)::int from public.tag_challenges
           where tagger_id = '00000000-0000-0000-0000-0000000fa201'), 0,
  'no tag slot is made');
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fa201'), 1,
  'it counts as an open invite');

-- 2. The cap and the switch still hold.
update public.app_config set max_open_invites = 1;
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa201');
select throws_ok($$select public.make_mate_invite()$$, '22023', 'too many open invites',
  'past the cap, no more invites');
reset role;
update public.app_config set max_open_invites = 10, invite_links_enabled = false;
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa201');
select throws_ok($$select public.make_mate_invite()$$, '22023', 'invite links are off',
  'no invites while links are off');
reset role;
update public.app_config set invite_links_enabled = true;
set local role anon;
select throws_ok($$select public.make_mate_invite()$$, '42501', null, 'signed out, no invite');
reset role;

-- 3. Before joining, the invite says it is not a tag.
select ok((public.get_invite_preview(pg_temp.token('mate')) ->> 'tag')::boolean = false,
  'the preview says no tag comes with it');

-- 4. A's next post and the clean-up leave it alone.
insert into public.tag_challenges (tagger_id, tagged_id, started_at, expires_at)
values ('00000000-0000-0000-0000-0000000fa204', '00000000-0000-0000-0000-0000000fa201',
        now(), now() + interval '48 hours');
update public.app_config set tags_required = false;
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa201');
select lives_ok($$select public.create_post('88888888-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000fa201/a1.jpg')$$, 'A posts an answer');
reset role;
update public.app_config set tags_required = true;
select public.expire_invites();
select ok((public.get_invite_preview(pg_temp.token('mate')) ->> 'open')::boolean,
  'the invite is still open after A posts and the clean-up runs');

-- 5. N joins from it: they follow each other, and no tag starts.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa202');
select is(
  (select jsonb_build_object('tag', r -> 'tag', 'expires_at', r -> 'expires_at')
   from public.claim_invite(pg_temp.token('mate')) r),
  '{"tag": false, "expires_at": null}'::jsonb,
  'N joins: no tag, no clock');
reset role;
select ok(
  exists (select 1 from public.follows where follower_id = '00000000-0000-0000-0000-0000000fa201'
            and following_id = '00000000-0000-0000-0000-0000000fa202')
  and exists (select 1 from public.follows where follower_id = '00000000-0000-0000-0000-0000000fa202'
            and following_id = '00000000-0000-0000-0000-0000000fa201'),
  'A and N follow each other');
select is((select count(*)::int from public.tag_challenges
           where tagged_id = '00000000-0000-0000-0000-0000000fa202'), 0,
  'N has no tag to answer');
select is((select count(*)::int from public.notifications
           where user_id = '00000000-0000-0000-0000-0000000fa201' and type = 'invite_joined'
             and actor_id = '00000000-0000-0000-0000-0000000fa202'), 1,
  'A hears that N joined');
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fa201'), 0,
  'a used invite no longer counts');

-- 6. One that ran out: not counted, and nobody can join from it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa201');
insert into pg_temp.ids select 'old', public.make_mate_invite() ->> 'token';
reset role;
update public.invites set expires_at = now() - interval '1 minute' where token = pg_temp.token('old');
select is(public.open_invite_count('00000000-0000-0000-0000-0000000fa201'), 0,
  'an invite that ran out no longer counts');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa203');
select throws_ok($$select public.claim_invite(pg_temp.token('old'))$$, '22023', 'that invite has expired',
  'nobody joins from an invite that ran out');
reset role;

-- 7. A tag slot's link still says a tag comes with it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa204');
insert into pg_temp.ids select 'slot', public.make_invite_link() ->> 'token';
reset role;
select ok((public.get_invite_preview(pg_temp.token('slot')) ->> 'tag')::boolean,
  'a tag slot''s link says a tag comes with it');
select pg_temp.as_user('00000000-0000-0000-0000-0000000fa203');
select ok((public.claim_invite(pg_temp.token('slot')) ->> 'tag')::boolean,
  'and joining from it says so too');
reset role;

select * from finish();
rollback;
