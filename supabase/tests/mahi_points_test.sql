-- Mahi points (founder, 2026-10-02): each post that answers at least one open tag earns its poster
-- 1 point; the tagger earns nothing; there is no daily cap; missing a tag's 48 hours puts the
-- points back to 0 and the best is kept. The number lives in profiles.streak_current (best:
-- streak_highest). The old never-resetting points (point_events, award_point, the 3-a-day cap)
-- are gone; `points` in the profile, feed and tag list now carries the Mahi points.
begin;
select plan(24);

update public.app_config set tags_required = false, quiet_start = '00:00', quiet_end = '00:00';

-- A, B, C and D all follow each other.
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000d0' || c || c)::uuid, 'mp-' || c || '@example.invalid'
from unnest(array['a', 'b', 'c', 'd']) c;
insert into public.profiles (id, username, timezone)
select ('00000000-0000-0000-0000-00000000d0' || c || c)::uuid, 'mp_' || c, 'Europe/London'
from unnest(array['a', 'b', 'c', 'd']) c;
insert into public.follows (follower_id, following_id)
select ('00000000-0000-0000-0000-00000000d0' || x || x)::uuid, ('00000000-0000-0000-0000-00000000d0' || y || y)::uuid
from unnest(array['a', 'b', 'c', 'd']) x, unnest(array['a', 'b', 'c', 'd']) y
where x <> y;
insert into storage.objects (bucket_id, name)
select 'posts', '00000000-0000-0000-0000-00000000d0' || c || c || '/' || n || '.jpg'
from unnest(array['a', 'b', 'c', 'd']) c, generate_series(1, 9) n;

create function pg_temp.uid(p_who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000d0' || p_who || p_who)::uuid
$$;
-- p_who posts photo n, tagging p_tags; returns the create_post result.
create function pg_temp.post(p_who text, n int, p_tags text[] default '{}') returns jsonb
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.uid(p_who), 'role', 'authenticated')::text, true);
  return public.create_post(gen_random_uuid(),
    pg_temp.uid(p_who) || '/' || n || '.jpg', null, null,
    array(select pg_temp.uid(t) from unnest(p_tags) t));
end;
$$;
-- A tag from p_from to A, written directly as create_post would.
create function pg_temp.tag_a(p_from text, p_created interval default '0') returns void
language sql as $$
  insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at)
  values (pg_temp.uid(p_from), pg_temp.uid('a'), now() - p_created, now() - p_created + interval '48 hours');
$$;
create function pg_temp.pts(p_who text) returns int language sql as $$
  select streak_current from public.profiles where id = pg_temp.uid(p_who)
$$;
create function pg_temp.best(p_who text) returns int language sql as $$
  select streak_highest from public.profiles where id = pg_temp.uid(p_who)
$$;

-- 1. A's first post tags B and C. B and C answer: each earns 1, A (the tagger) earns nothing.
select pg_temp.post('a', 1, array['b', 'c']);
reset role;
select is(pg_temp.pts('a'), 0, 'a first post earns nothing');
select is((pg_temp.post('b', 1) -> 'streak' ->> 'streak_current')::int, 1,
  'answering a tag earns the answerer 1 Mahi point');
reset role;
select pg_temp.post('c', 1);
reset role;
select is(pg_temp.pts('c'), 1, 'the second friend earns 1 for answering too');
select is(pg_temp.pts('a'), 0, 'the tagger earns nothing when their tags are answered');

-- 2. One post answering two tags still earns 1.
select pg_temp.tag_a('b');
select pg_temp.tag_a('c');
select is((pg_temp.post('a', 2) -> 'streak' ->> 'streak_current')::int, 1,
  'one post answering two tags earns 1, not 2');
reset role;
select is(pg_temp.pts('b') + pg_temp.pts('c'), 2, 'and its two taggers earn nothing');

-- 3. No daily cap: four answering posts on one day are four points.
select pg_temp.tag_a('b');
select pg_temp.post('a', 3);
reset role;
select pg_temp.tag_a('c');
select pg_temp.post('a', 4);
reset role;
select pg_temp.tag_a('d');
select is((pg_temp.post('a', 5) -> 'streak' ->> 'streak_current')::int, 4,
  'four answering posts in one day earn four points (no daily cap)');
reset role;
select is(pg_temp.best('a'), 4, 'the best follows the points up');
select is((select streak_day from public.posts where image_path = pg_temp.uid('a') || '/5.jpg'), 4,
  'the post carries its poster''s points after it');

-- 4. Points travel where the app shows them, under the name `points` the apps on phones read.
select is((select public.points(p) from public.profiles p where p.id = pg_temp.uid('a')), 4,
  'the profile''s points are the Mahi points (for apps still on phones)');
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
         json_build_object('sub', pg_temp.uid('b'), 'role', 'authenticated')::text, true);
select is((select points from public.get_taggable_friends('', 10) where username = 'mp_a'), 4,
  'the tag list shows the Mahi points');
select is(
  (select (i -> 'profile' ->> 'points')::int
   from jsonb_array_elements(public.get_feed(20) -> 'items') i
   where i -> 'profile' ->> 'username' = 'mp_a'
   limit 1),
  4, 'feed items show the poster''s Mahi points');
reset role;

-- 5. A misses C's tag: points back to 0, the best is kept, the push says points.
select pg_temp.tag_a('c', '49 hours');
select public.mark_missed_tags();
select is(pg_temp.pts('a'), 0, 'a missed tag puts the points back to 0');
select is(pg_temp.best('a'), 4, 'the best is never lowered');
select is((select public.points(p) from public.profiles p where p.id = pg_temp.uid('a')), 0,
  'and the profile''s points follow it to 0');
select is((select body from public.push_outbox
           where kind = 'streak_lost' and user_id = pg_temp.uid('a')),
  'You missed @mp_c''s tag. Your points are back to 0.', 'the push says the points are back to 0');
select is(pg_temp.pts('c'), 1, 'the tagger whose tag was missed keeps their own points');

-- 6. Earning again after a miss starts from 0.
select pg_temp.tag_a('d');
select is((pg_temp.post('a', 6) -> 'streak' ->> 'streak_current')::int, 1, 'points start again from 0');
reset role;
select is(pg_temp.best('a'), 4, 'the best stays at 4');

-- 7. The old points system is gone.
select hasnt_table('public', 'point_events', 'the old points ledger is gone');
select hasnt_function('public', 'award_point', 'award_point is gone');
select hasnt_column('public', 'app_config', 'daily_point_cap', 'the daily points cap is gone');
select hasnt_view('stats', 'points_daily', 'the old points stats view is gone');
select ok(not has_function_privilege('anon', 'public.points(public.profiles)', 'execute'),
  'signed-out callers still cannot read points');

select * from finish();
rollback;
