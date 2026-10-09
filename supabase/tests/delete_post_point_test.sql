-- A post that earned a Mahi point gives it back when it is deleted (core workflow, 2026-10-09).
-- posts.earned_point is set for a first post and for a post that answers a tag; delete_post takes
-- 1 off the points (never below 0, Best never changes), unless a missed tag reset the person after
-- that post, and answers the new streak.
-- Migration: 20261009100000_first_post_tag_and_post_points.
begin;
select plan(24);

update public.app_config set tags_required = true, tag_count = 3, invite_links_enabled = true,
  feed_lock_enabled = false, quiet_start = '00:00', quiet_end = '00:00',
  max_open_invites = 10;

-- p posts twice; q is reset by a miss after posting; r replays a post; u's old tag ran out just
-- before posting; l has posts from before this change; s is a stranger; t tags.
create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000001f02' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'dpp-' || c || '@example.invalid' from unnest(array['p','q','r','u','l','s','t']) c;
insert into public.profiles (id, username, timezone)
select pg_temp.uid(c), 'dpp_' || c, 'Europe/London' from unnest(array['p','q','r','u','l','s','t']) c;
insert into storage.objects (bucket_id, name)
select 'posts', pg_temp.uid(u)::text || '/' || n || '.jpg'
from unnest(array['p','q','r','u']) u, generate_series(1, 2) n;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(u), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.post(u text, n int, invites int, client uuid default gen_random_uuid())
returns jsonb language plpgsql as $$
begin
  perform pg_temp.as_user(u);
  return public.create_post(client, pg_temp.uid(u)::text || '/' || n || '.jpg',
    p_invite_count => invites);
end;
$$;
create function pg_temp.streak(u text) returns text language sql security definer as $$
  select streak_current || '/' || streak_highest from public.profiles where id = pg_temp.uid(u);
$$;
create function pg_temp.earned(p_id uuid) returns boolean language sql security definer as $$
  select earned_point from public.posts where id = p_id;
$$;
create table pg_temp.ids (name text primary key, id uuid);
grant all on pg_temp.ids to authenticated;

-- 1. The point flag: a first post and an answer earn it.
insert into pg_temp.ids select 'p1', (pg_temp.post('p', 1, 1) -> 'post' ->> 'id')::uuid;
reset role;
select ok(pg_temp.earned((select id from pg_temp.ids where name = 'p1')), 'a first post earns its point');
insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at)
values (pg_temp.uid('t'), pg_temp.uid('p'), now(), now(), now() + interval '48 hours');
insert into pg_temp.ids select 'p2', (pg_temp.post('p', 2, 3) -> 'post' ->> 'id')::uuid;
reset role;
select ok(pg_temp.earned((select id from pg_temp.ids where name = 'p2')), 'an answer earns its point');
select is(pg_temp.streak('p'), '2/2', 'two points, best 2');

-- 2. Rows from before the change: the first post and any answer are marked, the rest are not.
set local session_replication_role = replica;
insert into public.posts (id, user_id, image_url, image_path, streak_day, created_at, post_date) values
  ('00000000-0000-0000-0000-0000001f0291', pg_temp.uid('l'), 'x', 'l/1.jpg', 1, now() - interval '3 days', current_date - 3),
  ('00000000-0000-0000-0000-0000001f0292', pg_temp.uid('l'), 'x', 'l/2.jpg', 1, now() - interval '2 days', current_date - 2),
  ('00000000-0000-0000-0000-0000001f0293', pg_temp.uid('l'), 'x', 'l/3.jpg', 1, now() - interval '1 day', current_date - 1);
insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at, answered_at, answered_post_id)
values (pg_temp.uid('t'), pg_temp.uid('l'), now() - interval '30 hours', now() - interval '30 hours',
        now() + interval '18 hours', now() - interval '1 day', '00000000-0000-0000-0000-0000001f0293');
set local session_replication_role = origin;
select is((select count(*)::int from public.posts where user_id = pg_temp.uid('l') and earned_point), 0,
  'a post written straight into the table has not earned a point');
-- The migration's backfill, run again over these rows.
update public.posts p
set earned_point = true
where not p.earned_point
  and (not exists (select 1 from public.posts e
                   where e.user_id = p.user_id and (e.created_at, e.id) < (p.created_at, p.id))
       or exists (select 1 from public.tag_challenges c where c.answered_post_id = p.id));
select is((select string_agg(earned_point::text, ',' order by created_at) from public.posts
           where user_id = pg_temp.uid('l')), 'true,false,true',
  'the backfill marks the first post and the answer, not the post in between');

-- 3. A stranger can't delete the post, and signed out is refused.
select pg_temp.as_user('s');
select throws_ok($$select public.delete_post((select id from pg_temp.ids where name = 'p2'))$$,
  '22023', 'post not found', 'a stranger cannot delete someone else''s post');
reset role;
select is(pg_temp.streak('p'), '2/2', 'and the owner keeps the point');
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select public.delete_post('00000000-0000-0000-0000-0000001f0291')$$,
  '42501', null, 'signed out is refused');
reset role;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true),
       set_config('role', 'authenticated', true);
select throws_ok($$select public.delete_post('00000000-0000-0000-0000-0000001f0291')$$,
  '42501', 'not signed in', 'no account is refused');
reset role;

-- 4. Deleting the answer takes its point back; Best stays.
create table pg_temp.out (j jsonb);
grant all on pg_temp.out to authenticated;
select pg_temp.as_user('p');
insert into pg_temp.out select public.delete_post((select id from pg_temp.ids where name = 'p2'));
reset role;
select is((select j -> 'streak' from pg_temp.out), '{"streak_current": 1, "streak_highest": 2}'::jsonb,
  'the delete answers the new points and Best');
select ok((select j ? 'image_path' and j ? 'pov_image_path' from pg_temp.out),
  'and still answers the files to remove');
select is(pg_temp.streak('p'), '1/2', 'one point taken off, Best unchanged');

-- 5. Never below 0.
update public.profiles set streak_current = 0 where id = pg_temp.uid('p');
select pg_temp.as_user('p');
select is(public.delete_post((select id from pg_temp.ids where name = 'p1')) -> 'streak',
  '{"streak_current": 0, "streak_highest": 2}'::jsonb, 'points never go below 0');
reset role;
select is(pg_temp.streak('p'), '0/2', 'still 0, Best 2');

-- 6. A miss after the post already reset the points: no change.
insert into pg_temp.ids select 'q1', (pg_temp.post('q', 1, 1) -> 'post' ->> 'id')::uuid;
reset role;
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '1 hour'
where id = (select id from pg_temp.ids where name = 'q1');
set local session_replication_role = origin;
insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at, missed_at)
values (pg_temp.uid('t'), pg_temp.uid('q'), now() - interval '50 minutes', now() - interval '50 minutes',
        now() - interval '20 minutes', now());
update public.profiles set streak_current = 4, streak_highest = 4 where id = pg_temp.uid('q');
select pg_temp.as_user('q');
select lives_ok($$select public.delete_post((select id from pg_temp.ids where name = 'q1'))$$,
  'q deletes a post made before a miss');
reset role;
select is(pg_temp.streak('q'), '4/4', 'the points earned since the miss stay');

-- 7. A tag that ran out before the post (marked missed by that same post): the point still goes.
insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at)
values (pg_temp.uid('t'), pg_temp.uid('u'), now() - interval '50 hours', now() - interval '50 hours',
        now() - interval '2 hours');
update public.profiles set streak_current = 3, streak_highest = 3 where id = pg_temp.uid('u');
insert into pg_temp.ids select 'u1', (pg_temp.post('u', 1, 1) -> 'post' ->> 'id')::uuid;
reset role;
select is(pg_temp.streak('u'), '1/3', 'the miss reset u to 0, then the first post earned 1');
select pg_temp.as_user('u');
select lives_ok($$select public.delete_post((select id from pg_temp.ids where name = 'u1'))$$,
  'u deletes it');
reset role;
select is(pg_temp.streak('u'), '0/3', 'the point goes back: the miss came before the post');

-- 8. A replayed post counts once, and its delete takes off once.
insert into pg_temp.ids values ('rc', gen_random_uuid());
select is(pg_temp.post('r', 1, 1, (select id from pg_temp.ids where name = 'rc')) ->> 'replayed', 'false',
  'r posts');
reset role;
select is(pg_temp.post('r', 1, 1, (select id from pg_temp.ids where name = 'rc')) ->> 'replayed', 'true',
  'the same post again is a replay');
reset role;
select is(pg_temp.streak('r') || ' ' || (select count(*) from public.posts where user_id = pg_temp.uid('r')),
  '1/1 1', 'one post, one point');
update public.profiles set streak_current = 5, streak_highest = 5 where id = pg_temp.uid('r');
select pg_temp.as_user('r');
select lives_ok($$select public.delete_post((select id from public.posts where user_id = pg_temp.uid('r')))$$,
  'r deletes it');
reset role;
select is(pg_temp.streak('r'), '4/5', 'one point back, not two');

select * from finish();
rollback;
