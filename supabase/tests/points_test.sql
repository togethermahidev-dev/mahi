-- Mahi points: answerer and tagger each earn 1 per answered tag, at most 3 a day, never lost.
begin;
select plan(10);

-- B is tagged by C, D, E and F; everyone follows each other with B.
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000f00' || c)::uuid, 'pts-' || c || '@example.invalid'
from unnest(array['b', 'c', 'd', 'e', 'f']) c;
insert into public.profiles (id, username)
select ('00000000-0000-0000-0000-00000000f00' || c)::uuid, 'pts_' || c
from unnest(array['b', 'c', 'd', 'e', 'f']) c;
insert into public.follows (follower_id, following_id)
select ('00000000-0000-0000-0000-00000000f00' || x)::uuid, ('00000000-0000-0000-0000-00000000f00' || y)::uuid
from unnest(array['c', 'd', 'e', 'f']) x, (values ('b')) v(y)
union all
select ('00000000-0000-0000-0000-00000000f00b')::uuid, ('00000000-0000-0000-0000-00000000f00' || x)::uuid
from unnest(array['c', 'd', 'e', 'f']) x;
insert into storage.objects (bucket_id, name)
select 'posts', '00000000-0000-0000-0000-00000000f00' || c || '/p.jpg'
from unnest(array['b', 'c', 'd', 'e', 'f']) c;

update public.app_config set tags_required = false;

create function pg_temp.post_as(p_who text, p_tags uuid[]) returns jsonb language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000f00' || p_who, 'role', 'authenticated')::text, true);
  return public.create_post(gen_random_uuid(), '00000000-0000-0000-0000-00000000f00' || p_who || '/p.jpg',
                            null, null, p_tags);
end;
$$;
create function pg_temp.pts(p_who text) returns int language sql as $$
  select public.points(p) from public.profiles p where p.username = 'pts_' || p_who
$$;

-- C, D, E and F each tag B.
select pg_temp.post_as(x, array['00000000-0000-0000-0000-00000000f00b']::uuid[])
from unnest(array['c', 'd', 'e', 'f']) x;
reset role;
select is(pg_temp.pts('b'), 0, 'no points before answering');

-- B posts once and answers all four tags.
select pg_temp.post_as('b', '{}');
reset role;
select is(pg_temp.pts('b'), 3, 'answering 4 tags in a day earns 3 points (daily cap)');
select is(pg_temp.pts('c') + pg_temp.pts('d') + pg_temp.pts('e') + pg_temp.pts('f'), 4,
  'each tagger earns 1 when their tag is answered');
select is((select count(*)::int from public.point_events where role = 'answerer'), 3, 'three answerer events');

-- Nothing can award the same tag twice.
select public.award_point('00000000-0000-0000-0000-00000000f00c',
  (select id from public.tag_challenges where tagger_id = '00000000-0000-0000-0000-00000000f00c'), 'tagger');
select is(pg_temp.pts('c'), 1, 'the same tag never pays twice');

-- Points are never lost.
delete from public.tag_challenges where tagger_id = '00000000-0000-0000-0000-00000000f00d';
select is(pg_temp.pts('d'), 1, 'points stay when the challenge is gone');

-- Banned users earn nothing.
update public.profiles set is_banned = true where username = 'pts_e';
select public.award_point('00000000-0000-0000-0000-00000000f00e', null, 'tagger');
select is(pg_temp.pts('e'), 1, 'a banned user earns no new points');

-- Points travel with profiles, the feed and the tag list; clients can't write them.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000f00c","role":"authenticated"}';
select is((select points from public.get_taggable_friends('', 10) where username = 'pts_b'), 3,
  'the tag list shows points');
select is(
  (select (i -> 'profile' ->> 'points')::int
   from jsonb_array_elements(public.get_feed(5) -> 'items') i
   where i -> 'profile' ->> 'username' = 'pts_b'),
  3, 'feed items show the poster''s points');
select throws_ok(
  $$insert into public.point_events (user_id, role, local_date, slot)
    values ('00000000-0000-0000-0000-00000000f00c', 'tagger', current_date, 9)$$,
  '42501', null, 'clients cannot write points'
);

select * from finish();
rollback;
