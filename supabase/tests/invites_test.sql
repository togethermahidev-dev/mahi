-- Invite links: a tag slot filled by someone not on Mahi, and what happens when they join.
begin;
select plan(27);

-- Quiet hours off, so a reminder's send time is never moved and the counts below are exact.
update public.app_config set quiet_start = '00:00', quiet_end = '00:00';

-- A and B follow each other. N and X are brand new. O signed up three days ago.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d00a', 'inv-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000d00b', 'inv-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000d00c', 'inv-n@example.invalid'),
  ('00000000-0000-0000-0000-00000000d00d', 'inv-o@example.invalid'),
  ('00000000-0000-0000-0000-00000000d00e', 'inv-x@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-00000000d00a', 'inv_a', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000d00b', 'inv_b', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000d00c', 'inv_n', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000d00e', 'inv_x', 'Europe/London');
insert into public.profiles (id, username, timezone, created_at) values
  ('00000000-0000-0000-0000-00000000d00d', 'inv_o', 'Europe/London', now() - interval '3 days');
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-00000000d00a', '00000000-0000-0000-0000-00000000d00b'),
  ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d00a');
insert into storage.objects (bucket_id, name) values
  ('posts', '00000000-0000-0000-0000-00000000d00a/a1.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000d00b/b1.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000d00c/n1.jpg');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- The app never reads the invites table; these two are the test's way in, as the owner.
create function pg_temp.token() returns text language sql security definer as $$
  select token from public.invites order by created_at, token limit 1;
$$;
create function pg_temp.open_code() returns text language sql security definer as $$
  select code from public.invites where claimed_at is null order by created_at, token limit 1;
$$;
create function pg_temp.post(p_tags uuid[], p_invites int)
returns jsonb language sql as $$
  select public.create_post('22222222-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-00000000d00a/a1.jpg', null, null, p_tags, null, null, p_invites);
$$;

-- 1. A has one friend, so one tag plus two invites fills the post.
select pg_temp.as_user('00000000-0000-0000-0000-00000000d00a');
select throws_ok(
  $$select pg_temp.post(array['00000000-0000-0000-0000-00000000d00b']::uuid[], 3)$$,
  '22023', null, 'a fourth slot is refused'
);
select lives_ok(
  $$select pg_temp.post(array['00000000-0000-0000-0000-00000000d00b']::uuid[], 2)$$,
  'one friend and two invites fills the post'
);
select is(
  jsonb_array_length(pg_temp.post(array['00000000-0000-0000-0000-00000000d00b']::uuid[], 2) -> 'invites'),
  2, 'the post comes back with two links'
);
select ok(
  (select bool_and(i.url = (select invite_base_url from public.app_config) || i.token
                   and i.token ~ '^[0-9a-f]{32}$')
   from jsonb_to_recordset(
     pg_temp.post(array['00000000-0000-0000-0000-00000000d00b']::uuid[], 2) -> 'invites')
     as i(url text, token text)),
  'a link is the invite address plus its token'
);
select ok(
  (select bool_and(i.code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$')
   from jsonb_to_recordset(
     pg_temp.post(array['00000000-0000-0000-0000-00000000d00b']::uuid[], 2) -> 'invites')
     as i(code text)),
  'a code is 6 characters, with no 0, O, 1 or I to misread'
);
reset role;
select is((select count(*)::int from public.invites), 2,
  'the retries handed back the same two links and made no more');

-- 2. A slot waiting for someone is nobody's tag until they join.
select is(
  (select count(*)::int from public.tag_challenges where tagged_id is null), 2,
  'two challenges are waiting for nobody'
);
select pg_temp.as_user('00000000-0000-0000-0000-00000000d00b');
select is((select count(*)::int from public.get_open_tags()), 1, 'B sees only the real tag');
reset role;
select public.mark_missed_tags();
select is(
  (select count(*)::int from public.tag_challenges where tagged_id is null and missed_at is not null),
  0, 'a waiting invite is never marked missed'
);

-- 3. The preview, before anyone has signed in.
set local role anon;
select is(public.get_invite_preview(pg_temp.token()) ->> 'username', 'inv_a',
  'the preview names who sent the link');
select ok(public.get_invite_preview('NOPE99') is null, 'an unknown code shows nothing');
reset role;

-- 4. Claiming.
select pg_temp.as_user('00000000-0000-0000-0000-00000000d00d');
select throws_ok($$select public.claim_invite(pg_temp.token())$$, '22023', null,
  'an account older than a day cannot claim an invite');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d00a');
select throws_ok($$select public.claim_invite(pg_temp.token())$$, '22023', null,
  'you cannot claim your own invite');

select pg_temp.as_user('00000000-0000-0000-0000-00000000d00c');
select lives_ok($$select public.claim_invite(pg_temp.token())$$, 'the new person can claim it');
reset role;
select is(
  (select count(*)::int from public.tag_challenges
   where tagged_id = '00000000-0000-0000-0000-00000000d00c'), 1,
  'the waiting challenge now points at them'
);
select ok(
  (select expires_at from public.tag_challenges
   where tagged_id = '00000000-0000-0000-0000-00000000d00c')
  between now() + interval '47 hours' and now() + interval '48 hours',
  'the 48-hour clock starts when they join'
);
select is(
  (select count(*)::int from public.follows
   where (follower_id = '00000000-0000-0000-0000-00000000d00a'
          and following_id = '00000000-0000-0000-0000-00000000d00c')
      or (follower_id = '00000000-0000-0000-0000-00000000d00c'
          and following_id = '00000000-0000-0000-0000-00000000d00a')), 2,
  'they follow each other both ways'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000d00a' and type = 'invite_joined'), 1,
  'the inviter is told they joined'
);
select is(
  (select count(*)::int from public.push_outbox
   where user_id = '00000000-0000-0000-0000-00000000d00c' and kind = 'tag_reminder'), 2,
  'the new person gets both reminders'
);

select pg_temp.as_user('00000000-0000-0000-0000-00000000d00c');
select lives_ok($$select public.claim_invite(pg_temp.token())$$, 'claiming again changes nothing');
reset role;
select is((select count(*)::int from public.invites where claimed_at is not null), 1,
  'only one claim is recorded');

select pg_temp.as_user('00000000-0000-0000-0000-00000000d00e');
select throws_ok($$select public.claim_invite(pg_temp.token())$$, '22023', null,
  'the second person to use a link is turned away');
select lives_ok($$select public.claim_invite(pg_temp.open_code())$$,
  'the 6-character code works as well as the link');

-- 5. A link nobody used.
select pg_temp.as_user('00000000-0000-0000-0000-00000000d00b');
select public.create_post('22222222-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-00000000d00b/b1.jpg', null, null,
  array['00000000-0000-0000-0000-00000000d00a']::uuid[], null, null, 1);
reset role;
update public.invites set expires_at = now() - interval '1 day' where claimed_at is null;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d00e');
select throws_ok($$select public.claim_invite(pg_temp.open_code())$$, '22023', null,
  'an expired link cannot be claimed');
reset role;
select public.expire_invites();
select is(
  (select count(*)::int from public.tag_challenges
   where tagged_id is null and cancelled_at is not null), 1,
  'an expired link takes its waiting tag with it'
);

-- 6. Once invite links are switched on, every slot must be filled.
update public.app_config set invite_links_enabled = true;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d00c');
select throws_ok(
  $$select public.create_post('22222222-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-00000000d00c/n1.jpg', null, null,
    array['00000000-0000-0000-0000-00000000d00a']::uuid[])$$,
  '22023', null, 'with invite links on, one friend is no longer enough'
);
select lives_ok(
  $$select public.create_post('22222222-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-00000000d00c/n1.jpg', null, null,
    array['00000000-0000-0000-0000-00000000d00a']::uuid[], null, null, 2)$$,
  'invites fill the rest of the slots'
);

select * from finish();
rollback;
