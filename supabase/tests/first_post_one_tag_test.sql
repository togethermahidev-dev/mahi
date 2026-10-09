-- The first post tags exactly one person (core workflow, 2026-10-09): a friend, a link slot or an
-- invite counts. Answers still tag 3. app_config.first_post_tags is the switch; 0 brings back the
-- old rule (a first post may tag nobody).
-- Migration: 20261009100000_first_post_tag_and_post_points.
begin;
select plan(18);

update public.app_config set tags_required = true, tag_count = 3, invite_links_enabled = true,
  feed_lock_enabled = false, quiet_start = '00:00', quiet_end = '00:00', max_open_invites = 10;

-- a, b, c, d, e, g post for the first time; x, y, z are everyone's friends; t tags.
create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000001f01' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'fpt-' || c || '@example.invalid'
from unnest(array['a','b','c','d','e','g','x','y','z','t']) c;
insert into public.profiles (id, username, timezone)
select pg_temp.uid(c), 'fpt_' || c, 'Europe/London'
from unnest(array['a','b','c','d','e','g','x','y','z','t']) c;
insert into public.follows (follower_id, following_id)
select pg_temp.uid(p), pg_temp.uid(f)
from unnest(array['a','b','c','d','e','g']) p, unnest(array['x','y','z']) f
union all
select pg_temp.uid(f), pg_temp.uid(p)
from unnest(array['a','b','c','d','e','g']) p, unnest(array['x','y','z']) f;
insert into storage.objects (bucket_id, name)
select 'posts', pg_temp.uid(u)::text || '/' || n || '.jpg'
from unnest(array['a','b','c','d','e','g']) u, generate_series(1, 3) n;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(u), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.post(u text, n int, tags uuid[] default '{}', invites int default 0,
                             slots uuid[] default '{}')
returns jsonb language plpgsql as $$
begin
  perform pg_temp.as_user(u);
  return public.create_post(gen_random_uuid(), pg_temp.uid(u)::text || '/' || n || '.jpg',
    null, null, tags, p_invite_count => invites, p_slot_ids => slots);
end;
$$;
-- The detail of the error a statement raises, as jsonb.
create function pg_temp.detail(q text) returns jsonb language plpgsql as $$
declare
  v text;
begin
  execute q;
  return null;
exception when others then
  get stacked diagnostics v = pg_exception_detail;
  return nullif(v, '')::jsonb;
end;
$$;
create function pg_temp.tag(p_to text) returns void language sql as $$
  insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at)
  values (pg_temp.uid('t'), pg_temp.uid(p_to), now(), now(), now() + interval '48 hours');
$$;

-- 1. A first post with no tags, or with two, is refused.
select throws_ok($$select pg_temp.post('a', 1)$$, '22023', 'tag or invite 1 people',
  'a first post with no tags is refused');
reset role;
select is(pg_temp.detail($$select pg_temp.post('a', 1)$$), '{"required": 1, "max": 1}'::jsonb,
  'the error says one is required and one is the most');
reset role;
select throws_ok($$select pg_temp.post('a', 1, array[pg_temp.uid('x'), pg_temp.uid('y')])$$,
  '22023', 'tag or invite 1 people', 'a first post with two tags is refused');
reset role;

-- 2. One friend, one link slot or one invite each counts.
select lives_ok($$select pg_temp.post('a', 1, array[pg_temp.uid('x')])$$,
  'a first post tagging one friend goes');
reset role;
select pg_temp.as_user('b');
create table pg_temp.ids (name text primary key, id uuid);
grant all on pg_temp.ids to authenticated;
insert into pg_temp.ids select 'slot_b', (public.make_invite_link() ->> 'challenge_id')::uuid;
select lives_ok($$select pg_temp.post('b', 1, slots => array[(select id from pg_temp.ids where name = 'slot_b')])$$,
  'a first post with one link slot goes');
reset role;
select lives_ok($$select pg_temp.post('c', 1, invites => 1)$$,
  'a first post with one invite goes');
reset role;

-- 3. A first post that answers a tag still needs exactly one.
select pg_temp.tag('d');
select throws_ok($$select pg_temp.post('d', 1)$$, '22023', 'tag or invite 1 people',
  'a first post answering a tag with no tags is refused');
reset role;
select lives_ok($$select pg_temp.post('d', 1, array[pg_temp.uid('y')])$$,
  'a first post answering a tag with one tag goes');
reset role;
select ok((select answered_at is not null from public.tag_challenges
           where tagged_id = pg_temp.uid('d') and tagger_id = pg_temp.uid('t')),
  'and it answers the tag');

-- 4. After the first post: no live tag, no post; an answer tags 3.
select throws_ok($$select pg_temp.post('a', 2)$$, 'P0001', 'reactive posting: not tagged',
  'a second post with no tag to answer is refused');
reset role;
select pg_temp.tag('a');
select throws_ok($$select pg_temp.post('a', 2, array[pg_temp.uid('y')])$$,
  '22023', 'tag or invite 3 people', 'a second post with one tag is refused');
reset role;
select is(pg_temp.detail($$select pg_temp.post('a', 2)$$), '{"required": 3, "max": 3}'::jsonb,
  'an answer needs 3 and allows 3');
reset role;
select lives_ok($$select pg_temp.post('a', 2, array[pg_temp.uid('y'), pg_temp.uid('z')], 1)$$,
  'a second post tagging 3 goes');
reset role;

-- 5. Signed out is refused.
select set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$select public.create_post(gen_random_uuid(), pg_temp.uid('e')::text || '/1.jpg', p_invite_count => 1)$$,
  '42501', null, 'a signed-out caller is refused');
reset role;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true),
       set_config('role', 'authenticated', true);
select throws_ok(
  $$select public.create_post(gen_random_uuid(), pg_temp.uid('e')::text || '/1.jpg', p_invite_count => 1)$$,
  '42501', 'not signed in', 'a caller with no account is refused');
reset role;

-- 6. The switch at 0 brings back the old rule: a first post tags 0 to 3.
select is((select first_post_tags from public.app_config), 1, 'the switch starts at 1');
update public.app_config set first_post_tags = 0;
select lives_ok($$select pg_temp.post('e', 1)$$, 'with the switch at 0 a first post may tag nobody');
reset role;
select lives_ok($$select pg_temp.post('g', 1, array[pg_temp.uid('x'), pg_temp.uid('y'), pg_temp.uid('z')])$$,
  'and may still tag 3');
reset role;

select * from finish();
rollback;
