-- Tag nudge: the picker knows when anyone last tagged each friend, and sorts the forgotten first.
begin;
select plan(6);

-- a, b, c and d all follow each other.
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000e10' || c)::uuid, 'tn-' || c || '@example.invalid'
from unnest(array['a', 'b', 'c', 'd']) c;
insert into public.profiles (id, username, timezone)
select ('00000000-0000-0000-0000-00000000e10' || c)::uuid, 'tn_' || c, 'Europe/London'
from unnest(array['a', 'b', 'c', 'd']) c;
insert into public.follows (follower_id, following_id)
select ('00000000-0000-0000-0000-00000000e10' || x)::uuid, ('00000000-0000-0000-0000-00000000e10' || y)::uuid
from unnest(array['a', 'b', 'c', 'd']) x, unnest(array['a', 'b', 'c', 'd']) y where x <> y;

-- b tagged c ten days ago (answered); d tagged b two days ago (still open). Nobody tagged a.
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at, answered_at) values
  ('00000000-0000-0000-0000-00000000e10b', '00000000-0000-0000-0000-00000000e10c',
   now() - interval '10 days', now() - interval '8 days', now() - interval '9 days');
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at) values
  ('00000000-0000-0000-0000-00000000e10d', '00000000-0000-0000-0000-00000000e10b',
   now() - interval '2 days', now() + interval '1 hour');

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object(
           'sub', '00000000-0000-0000-0000-00000000e10' || p_who, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.last_tagged(p_who text) returns timestamptz language sql as $$
  select (to_jsonb(f) ->> 'last_tagged_at')::timestamptz from public.get_taggable_friends() f
  where f.id = ('00000000-0000-0000-0000-00000000e10' || p_who)::uuid;
$$;

-- a opens the picker.
select pg_temp.as_user('a');
select is(pg_temp.last_tagged('c'), (select now() - interval '10 days'),
  'last_tagged_at counts a tag from someone else');
select is(pg_temp.last_tagged('b'), (select now() - interval '2 days'),
  'last_tagged_at is the latest tag on that person');
select is(pg_temp.last_tagged('d'), null, 'never tagged is null');
select is((select array_agg(username) from public.get_taggable_friends()),
  array['tn_d', 'tn_c', 'tn_b'], 'never tagged first, then longest ago');
reset role;

select is((select nudge_days from public.app_config), 7, 'nudge after 7 days by default');
select throws_ok($$ update public.app_config set nudge_days = 0 $$, '23514', null,
  'nudge_days must be at least 1');

select * from finish();
rollback;
