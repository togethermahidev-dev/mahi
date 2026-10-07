begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f00a', 'follow-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000f00b', 'follow-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000f00c', 'follow-c@example.invalid'),
  ('00000000-0000-0000-0000-00000000f00d', 'follow-d@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-00000000f00a', 'follow_a'),
  ('00000000-0000-0000-0000-00000000f00b', 'follow_b'),
  ('00000000-0000-0000-0000-00000000f00c', 'follow_c'),
  ('00000000-0000-0000-0000-00000000f00d', 'follow_d');
update public.profiles set is_banned = true
where id = '00000000-0000-0000-0000-00000000f00d';

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object(
           'sub', '00000000-0000-0000-0000-00000000f00' || p_who,
           'role', 'authenticated')::text, true);
$$;

select pg_temp.as_user('a');
select is((select is_following from public.set_following(
  '00000000-0000-0000-0000-00000000f00b', true)), true,
  'follow returns the committed state');
select is((select current_following_count::int from public.set_following(
  '00000000-0000-0000-0000-00000000f00b', true)), 1,
  'repeating follow is idempotent and returns the authoritative own count');
select is((select count(*)::int from public.follows where
  follower_id = '00000000-0000-0000-0000-00000000f00a' and
  following_id = '00000000-0000-0000-0000-00000000f00b'), 1,
  'follow inserts exactly one directional row');
reset role;
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-00000000f00b', '00000000-0000-0000-0000-00000000f00a');
select pg_temp.as_user('a');
select is((select follows_you from public.set_following(
  '00000000-0000-0000-0000-00000000f00b', false)), true,
  'unfollow preserves the other person''s independent follow');
select is((select is_following from public.set_following(
  '00000000-0000-0000-0000-00000000f00b', false)), false,
  'repeating unfollow is idempotent');
select is((select count(*)::int from public.follows where
  follower_id = '00000000-0000-0000-0000-00000000f00a' and
  following_id = '00000000-0000-0000-0000-00000000f00b'), 0,
  'unfollow deletes the caller''s row');

select throws_ok(
  $$select * from public.set_following('00000000-0000-0000-0000-00000000f00a', true)$$,
  '22023', 'cannot follow that person', 'self-follow is rejected');
select throws_ok(
  $$select * from public.set_following('00000000-0000-0000-0000-00000000f00d', true)$$,
  '22023', 'cannot follow that person', 'a banned person cannot be followed');

reset role;
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000f00c', '00000000-0000-0000-0000-00000000f00a');
select pg_temp.as_user('a');
select throws_ok(
  $$select * from public.set_following('00000000-0000-0000-0000-00000000f00c', true)$$,
  '22023', 'cannot follow that person', 'a block in either direction prevents following');

reset role;
select set_config('request.jwt.claims', '{}', true);
set role authenticated;
select throws_ok(
  $$select * from public.set_following('00000000-0000-0000-0000-00000000f00b', true)$$,
  '42501', 'not signed in', 'signed-out callers are rejected');
select ok(has_function_privilege('authenticated',
  'public.set_following(uuid, boolean)', 'execute'), 'authenticated can mutate their follow');

select * from finish();
rollback;
