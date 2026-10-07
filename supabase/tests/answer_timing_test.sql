-- On-time markers (owner, 2026-10-07): each feed and profile post says whose tag it answered, how
-- long that took and how much time was left, and whether it was the poster's first Mahi.
-- Migration: 20261007250000_answer_timing.
begin;
select plan(12);

-- A and C tag; B and D post.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a7a0a', 'at-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000a7a0b', 'at-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000a7a0c', 'at-c@example.invalid'),
  ('00000000-0000-0000-0000-0000000a7a0d', 'at-d@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000a7a0a', 'at_sam'),
  ('00000000-0000-0000-0000-0000000a7a0b', 'at_ali'),
  ('00000000-0000-0000-0000-0000000a7a0c', 'at_kim'),
  ('00000000-0000-0000-0000-0000000a7a0d', 'at_dee');

-- Chosen times (triggers off so they stick).
set local session_replication_role = replica;
insert into public.posts (id, user_id, image_url, image_path, streak_day, created_at, post_date) values
  -- B's first ever post, free.
  ('00000000-0000-0000-0000-0000000a7b01', '00000000-0000-0000-0000-0000000a7a0b', 'x',
   '00000000-0000-0000-0000-0000000a7a0b/1.jpg', 1, now() - interval '50 hours', current_date),
  -- B answers two tags: sam's (older, 2 hours to answer) and kim's.
  ('00000000-0000-0000-0000-0000000a7b02', '00000000-0000-0000-0000-0000000a7a0b', 'x',
   '00000000-0000-0000-0000-0000000a7a0b/2.jpg', 2, now() - interval '10 hours', current_date),
  -- B posts again, answering nothing.
  ('00000000-0000-0000-0000-0000000a7b03', '00000000-0000-0000-0000-0000000a7a0b', 'x',
   '00000000-0000-0000-0000-0000000a7a0b/3.jpg', 2, now() - interval '5 hours', current_date),
  -- B answers sam with 20 minutes to spare.
  ('00000000-0000-0000-0000-0000000a7b04', '00000000-0000-0000-0000-0000000a7a0b', 'x',
   '00000000-0000-0000-0000-0000000a7a0b/4.jpg', 3, now() - interval '1 hour', current_date),
  -- D's first ever post answers kim.
  ('00000000-0000-0000-0000-0000000a7d01', '00000000-0000-0000-0000-0000000a7a0d', 'x',
   '00000000-0000-0000-0000-0000000a7a0d/1.jpg', 1, now() - interval '2 hours', current_date);
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at, answered_post_id, answered_at) values
  ('00000000-0000-0000-0000-0000000a7a0a', '00000000-0000-0000-0000-0000000a7a0b',
   now() - interval '12 hours', now() + interval '36 hours',
   '00000000-0000-0000-0000-0000000a7b02', now() - interval '10 hours'),
  ('00000000-0000-0000-0000-0000000a7a0c', '00000000-0000-0000-0000-0000000a7a0b',
   now() - interval '11 hours', now() + interval '37 hours',
   '00000000-0000-0000-0000-0000000a7b02', now() - interval '10 hours'),
  ('00000000-0000-0000-0000-0000000a7a0a', '00000000-0000-0000-0000-0000000a7a0b',
   now() - interval '48 hours' - interval '40 minutes', now() - interval '40 minutes',
   '00000000-0000-0000-0000-0000000a7b04', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000a7a0c', '00000000-0000-0000-0000-0000000a7a0d',
   now() - interval '3 hours', now() + interval '45 hours',
   '00000000-0000-0000-0000-0000000a7d01', now() - interval '2 hours');
set local session_replication_role = origin;

create function pg_temp.item(p_id uuid) returns jsonb language sql as $$
  select public.feed_item(p, '00000000-0000-0000-0000-0000000a7a0a', false)
  from public.posts p where p.id = p_id
$$;

-- 1. A post that answered tags: the oldest tag's mate, time taken and time left.
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7b02') -> 'answered',
  '{"tagger_username": "at_sam", "seconds_taken": 7200, "seconds_to_spare": 165600}'::jsonb,
  'an answer names the oldest tag, how long it took and how long was left');
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7b04') -> 'answered' -> 'seconds_to_spare',
  '1200'::jsonb, 'an answer in the last hour says how many seconds were left');
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7b02') -> 'first_post', 'false'::jsonb,
  'a later post is not a first Mahi');

-- 2. A post that answered nothing.
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7b03') -> 'answered', 'null'::jsonb,
  'a post that answered no tag has answered null');
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7b03') -> 'first_post', 'false'::jsonb,
  'and it is not a first Mahi');

-- 3. First posts.
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7b01') -> 'first_post', 'true'::jsonb,
  'the first ever post is a first Mahi');
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7b01') -> 'answered', 'null'::jsonb,
  'a free first post answered no one');
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7d01') -> 'first_post', 'true'::jsonb,
  'a first post that answers a tag is still a first Mahi');
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7d01') -> 'answered' ->> 'tagger_username',
  'at_kim', '…and says whose tag it answered');

-- 4. Everything already there stays the same.
select is(pg_temp.item('00000000-0000-0000-0000-0000000a7b02') -> 'response',
  '{"tagger_username": "at_sam", "seconds": 7200}'::jsonb, 'the old response field is unchanged');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.item('00000000-0000-0000-0000-0000000a7b02')) k),
  array['answered', 'caption', 'comment_count', 'created_at', 'first_post', 'front_media_type', 'id',
        'image_path', 'latitude', 'like_count', 'liked_by_me', 'locked', 'longitude', 'post_date',
        'pov_image_path', 'profile', 'rear_media_type', 'response', 'streak_day', 'tagged_users',
        'user_id'],
  'every post keeps its fields and gains answered and first_post');

-- 5. The profile list carries them (get_user_posts and get_feed both build items with feed_item).
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000a7a0b","role":"authenticated"}', true);
end $$;
select is(
  (select jsonb_agg(i -> 'first_post' order by i ->> 'created_at')
   from jsonb_array_elements(public.get_user_posts('00000000-0000-0000-0000-0000000a7a0b', 10) -> 'items') i),
  '[true, false, false, false]'::jsonb, 'your profile posts say which was your first Mahi');
reset role;

select * from finish();
rollback;
