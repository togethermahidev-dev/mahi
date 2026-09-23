-- Friends: people who follow each other, as one list with no numbers on it.
begin;
select plan(7);

-- a<->b friends · a->c one way · a<->d but a blocks d · a<->e but e is banned
-- b<->c friends · b<->f friends but f blocks a
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000e00' || c)::uuid, 'fr-' || c || '@example.invalid'
from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) c;
insert into public.profiles (id, username)
select ('00000000-0000-0000-0000-00000000e00' || c)::uuid, 'fr_' || c
from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) c;
update public.profiles set is_banned = true where id = '00000000-0000-0000-0000-00000000e00e';
insert into public.follows (follower_id, following_id)
select ('00000000-0000-0000-0000-00000000e00' || x)::uuid, ('00000000-0000-0000-0000-00000000e00' || y)::uuid
from (values ('a', 'b'), ('b', 'a'), ('a', 'c'), ('a', 'd'), ('d', 'a'), ('a', 'e'), ('e', 'a'),
             ('b', 'c'), ('c', 'b'), ('b', 'f'), ('f', 'b')) v(x, y);
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000e00a', '00000000-0000-0000-0000-00000000e00d'),
  ('00000000-0000-0000-0000-00000000e00f', '00000000-0000-0000-0000-00000000e00a');

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object(
           'sub', '00000000-0000-0000-0000-00000000e00' || p_who, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.friends_of(p_who text) returns text[] language sql as $$
  select coalesce(array_agg(username order by username), '{}')
  from public.get_friends(('00000000-0000-0000-0000-00000000e00' || p_who)::uuid);
$$;

select pg_temp.as_user('a');
select is(pg_temp.friends_of('a'), array['fr_b'],
  'own friends: follows back, not blocked, not banned');
select is(pg_temp.friends_of('b'), array['fr_a', 'fr_c'],
  'someone else''s friends, minus anyone who blocks the viewer');
select is(pg_temp.friends_of('c'), array['fr_b'],
  'a one-way follow is not a friend');
select is((select count(*)::int from public.get_friends('00000000-0000-0000-0000-00000000e00b', 1, 0)), 1,
  'the list pages');

reset role;
select pg_temp.as_user('f');
select is(pg_temp.friends_of('b'), array['fr_c', 'fr_f'],
  'a viewer who blocked someone does not see them in a friend list');

reset role;
select ok(not has_function_privilege('anon', 'public.get_friends(uuid, int, int)', 'execute'),
  'anon cannot call get_friends');
select ok(has_function_privilege('authenticated', 'public.get_friends(uuid, int, int)', 'execute'),
  'signed-in users can call get_friends');

select * from finish();
rollback;
