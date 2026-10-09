-- The first workout needs no tags (show-up accountability, 2026-10-08): everyone starts by showing
-- up, with or without a tag to answer. After that every post is an answer to a live tag and tags 3.
-- Migration: 20261008140000_first_workout_no_tags.
begin;
select plan(8);
-- The first post here follows the old rule (first_post_tags = 0: it may tag 0 to 3; the one-tag
-- first post is tests/first_post_one_tag_test.sql).
update public.app_config set first_post_tags = 0;

update public.app_config set tags_required = true, tag_count = 3, invite_links_enabled = true,
  feed_lock_enabled = false, quiet_start = '00:00', quiet_end = '00:00';

-- A came alone. B was tagged by T. C's only tag ran out. F1-F3 are A's friends. T tags.
create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000fb' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'fw-' || c || '@example.invalid' from unnest(array['a','b','c','x','y','z','t']) c;
insert into public.profiles (id, username, timezone)
select pg_temp.uid(c), 'fw_' || c, 'Europe/London' from unnest(array['a','b','c','x','y','z','t']) c;
insert into public.follows (follower_id, following_id)
select pg_temp.uid('a'), pg_temp.uid(f) from unnest(array['x','y','z']) f
union all
select pg_temp.uid(f), pg_temp.uid('a') from unnest(array['x','y','z']) f;
insert into storage.objects (bucket_id, name)
select 'posts', pg_temp.uid(u)::text || '/' || n || '.jpg'
from unnest(array['a','b','c']) u, generate_series(1, 3) n;

create function pg_temp.post(u text, n int, tags uuid[] default '{}') returns jsonb language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.uid(u), 'role', 'authenticated')::text, true);
  return public.create_post(gen_random_uuid(), pg_temp.uid(u)::text || '/' || n || '.jpg',
    null, null, tags);
end;
$$;
create function pg_temp.tag(p_to text, ago interval default '0') returns void language sql as $$
  insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at)
  values (pg_temp.uid('t'), pg_temp.uid(p_to), now() - ago, now() - ago, now() - ago + interval '48 hours');
$$;

-- 1. A came alone: the first workout goes with no tags.
select lives_ok($$select pg_temp.post('a', 1)$$, 'a first workout with no tag to answer needs no tags');
reset role;

-- 2. B's first workout answers T's tag, with no tags.
select pg_temp.tag('b');
select lives_ok($$select pg_temp.post('b', 1)$$, 'a first workout that answers a tag needs no tags');
reset role;
select ok((select answered_at is not null from public.tag_challenges where tagged_id = pg_temp.uid('b')),
  'and it answers the tag');

-- 3. C's only tag ran out: still a first workout, so no tags.
select pg_temp.tag('c', interval '49 hours');
select lives_ok($$select pg_temp.post('c', 1)$$, 'a first workout whose tag ran out needs no tags');
reset role;

-- 4. After the first workout, a post must answer a live tag and tag 3.
select throws_ok($$select pg_temp.post('a', 2)$$, 'P0001', 'reactive posting: not tagged',
  'after the first workout, no live tag means no post');
reset role;
select pg_temp.tag('a');
select throws_ok($$select pg_temp.post('a', 2)$$, '22023', 'tag or invite 3 people',
  'a later answer with no tags is refused');
reset role;
select lives_ok($$select pg_temp.post('a', 3, array[pg_temp.uid('x'), pg_temp.uid('y'), pg_temp.uid('z')])$$,
  'a later answer tagging 3 friends goes');
reset role;

-- 5. Posting straight into the table is still refused.
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('a'), 'role', 'authenticated')::text, true);
select throws_ok(
  $$insert into public.posts (user_id, image_url, streak_day) values (pg_temp.uid('a'), 'x', 0)$$,
  '42501', null, 'a direct insert into posts is refused');
reset role;

select * from finish();
rollback;
