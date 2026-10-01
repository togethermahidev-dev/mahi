-- Feed lock: people you follow, hidden until you post; each post opens it for 24 hours, and after
-- that it stays open until someone tags you (a cancelled tag doesn't count; a missed one does).
begin;
select plan(28);

-- A follows B, C and E (banned); B follows A back; D is not followed.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d00a', 'feed-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000d00b', 'feed-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000d00c', 'feed-c@example.invalid'),
  ('00000000-0000-0000-0000-00000000d00d', 'feed-d@example.invalid'),
  ('00000000-0000-0000-0000-00000000d00e', 'feed-e@example.invalid');
insert into public.profiles (id, username, is_banned) values
  ('00000000-0000-0000-0000-00000000d00a', 'feed_a', false),
  ('00000000-0000-0000-0000-00000000d00b', 'feed_b', false),
  ('00000000-0000-0000-0000-00000000d00c', 'feed_c', false),
  ('00000000-0000-0000-0000-00000000d00d', 'feed_d', false),
  ('00000000-0000-0000-0000-00000000d00e', 'feed_e', true);
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-00000000d00a', '00000000-0000-0000-0000-00000000d00b'),
  ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d00a'),
  ('00000000-0000-0000-0000-00000000d00a', '00000000-0000-0000-0000-00000000d00c'),
  ('00000000-0000-0000-0000-00000000d00a', '00000000-0000-0000-0000-00000000d00e');

-- Posts with chosen times (triggers off so created_at/post_date stick).
set local session_replication_role = replica;
insert into public.posts (id, user_id, image_url, image_path, pov_image_path, caption, streak_day, created_at, post_date) values
  ('00000000-0000-0000-0000-0000000d0b01', '00000000-0000-0000-0000-00000000d00b', 'x',
   '00000000-0000-0000-0000-00000000d00b/b1.jpg', '00000000-0000-0000-0000-00000000d00b/b1_pov.jpg', 'b', 1,
   now() - interval '1 hour', current_date),
  ('00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-00000000d00c', 'x',
   '00000000-0000-0000-0000-00000000d00c/c1.jpg', null, 'c', 1, now() - interval '2 hours', current_date),
  ('00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-00000000d00d', 'x',
   '00000000-0000-0000-0000-00000000d00d/d1.jpg', null, 'd', 1, now() - interval '3 hours', current_date),
  ('00000000-0000-0000-0000-0000000d0e01', '00000000-0000-0000-0000-00000000d00e', 'x',
   '00000000-0000-0000-0000-00000000d00e/e1.jpg', null, 'e', 1, now() - interval '4 hours', current_date);
set local session_replication_role = origin;

create function pg_temp.feed() returns jsonb language sql as $$ select public.get_feed(20) $$;
create function pg_temp.ids(j jsonb) returns text language sql as $$
  select string_agg(i ->> 'id', ',' order by i ->> 'created_at' desc) from jsonb_array_elements(j -> 'items') i
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d00a","role":"authenticated"}';

-- 1. Never posted: locked, followed non-banned people only, no photos or captions.
select is((pg_temp.feed() ->> 'locked')::boolean, true, 'a new user''s feed is locked');
select is(pg_temp.feed() ->> 'unlocked_until', null, 'no unlock time yet');
select is(pg_temp.ids(pg_temp.feed()),
  '00000000-0000-0000-0000-0000000d0b01,00000000-0000-0000-0000-0000000d0c01',
  'only people you follow, not banned ones');
select is((select count(*)::int from jsonb_array_elements(pg_temp.feed() -> 'items') i
           where i ->> 'image_path' is not null or i ->> 'caption' is not null), 0,
  'locked items carry no photo paths or captions');
select is((pg_temp.feed() -> 'items' -> 0 -> 'profile' ->> 'username'), 'feed_b', 'locked items still show who posted');
select is(public.can_view_post_object('00000000-0000-0000-0000-00000000d00b/b1.jpg'), false,
  'a locked user cannot open a friend''s photo');
select is(public.can_view_post_object('00000000-0000-0000-0000-00000000d00a/anything.jpg'), true,
  'you can always open your own files');

-- 2. A posts: unlocked for 24 hours, photos visible, own post included.
reset role;
set local session_replication_role = replica;
insert into public.posts (id, user_id, image_url, image_path, streak_day, created_at, post_date) values
  ('00000000-0000-0000-0000-0000000d0a01', '00000000-0000-0000-0000-00000000d00a', 'x',
   '00000000-0000-0000-0000-00000000d00a/a1.jpg', 1, now() - interval '30 minutes', current_date);
set local session_replication_role = origin;
set local role authenticated;

select is((pg_temp.feed() ->> 'locked')::boolean, false, 'posting unlocks the feed');
select is((pg_temp.feed() ->> 'unlocked_until')::timestamptz, now() + interval '23 hours 30 minutes',
  'unlock lasts 24 hours from the post');
select is((pg_temp.feed() -> 'items' -> 0 ->> 'image_path'), '00000000-0000-0000-0000-00000000d00a/a1.jpg',
  'own post is in the feed');
select is((pg_temp.feed() -> 'items' -> 1 ->> 'caption'), 'b', 'unlocked items carry captions');
select is(public.can_view_post_object('00000000-0000-0000-0000-00000000d00b/b1_pov.jpg'), true,
  'an unlocked user can open a friend''s photo');
select is(public.can_view_post_object('00000000-0000-0000-0000-00000000d00d/d1.jpg'), false,
  'but not the photo of someone they don''t follow');

-- 3. Pages.
select is((select jsonb_array_length(public.get_feed(1) -> 'items')), 1, 'page size is respected');
select is(
  (public.get_feed(5, '2000-01-01'::timestamptz, '00000000-0000-0000-0000-000000000000') -> 'items'),
  '[]'::jsonb, 'cursor filters older posts');

-- 4. After the 24 hours: open until someone tags you, locked once they have.
reset role;
set local session_replication_role = replica;  -- posts can't be re-dated through the trigger
update public.posts set created_at = now() - interval '25 hours' where id = '00000000-0000-0000-0000-0000000d0a01';
set local session_replication_role = origin;
-- A tag from before the post was answered by it: it doesn't count.
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at, answered_at) values
  ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d00a',
   now() - interval '26 hours', now() + interval '22 hours', now() - interval '25 hours');
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, false, 'untagged since your last post: the feed stays open');

reset role;
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at) values
  ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d00a',
   now() - interval '10 hours', now() + interval '38 hours');
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, true, 'tagged since your last post: locked once the 24 hours end');

reset role;
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-0000000d0a01';
set local session_replication_role = origin;
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, false, 'posting again opens it for a fresh 24 hours');

reset role;
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '25 hours' where id = '00000000-0000-0000-0000-0000000d0a01';
set local session_replication_role = origin;
set local role authenticated;

-- 5. Profiles follow the same rule; your own never locks.
select is((public.get_user_posts('00000000-0000-0000-0000-00000000d00b', 10) -> 'items' -> 0 ->> 'image_path'), null,
  'a friend''s profile photos are hidden while locked');
select is((public.get_user_posts('00000000-0000-0000-0000-00000000d00a', 10) -> 'items' -> 0 ->> 'image_path'),
  '00000000-0000-0000-0000-00000000d00a/a1.jpg', 'your own profile always shows');

-- 6. Which tags lock. A's post is 25 hours old and B's open tag (10 hours old) locks it.
reset role;
update public.tag_challenges set cancelled_at = now()
where tagged_id = '00000000-0000-0000-0000-00000000d00a' and answered_at is null;
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, false, 'a cancelled tag doesn''t lock the feed');

reset role;
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at, missed_at) values
  ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d00a',
   now() - interval '20 hours', now() - interval '1 hour', now());
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, true, 'a missed tag still locks it');

-- A tag inside the 24 hours keeps the feed open until they end, then locks it.
reset role;
delete from public.tag_challenges where tagged_id = '00000000-0000-0000-0000-00000000d00a';
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '23 hours' where id = '00000000-0000-0000-0000-0000000d0a01';
set local session_replication_role = origin;
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at) values
  ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d00a',
   now() - interval '22 hours', now() + interval '26 hours');
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, false, 'a tag inside the 24 hours leaves the feed open');
reset role;
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '25 hours' where id = '00000000-0000-0000-0000-0000000d0a01';
update public.tag_challenges set created_at = now() - interval '24 hours', expires_at = now() + interval '24 hours'
where tagged_id = '00000000-0000-0000-0000-00000000d00a';
set local session_replication_role = origin;
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, true, '...and locks it once they end');

-- After the 24 hours, a new tag locks it at once.
reset role;
delete from public.tag_challenges where tagged_id = '00000000-0000-0000-0000-00000000d00a';
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '30 hours' where id = '00000000-0000-0000-0000-0000000d0a01';
set local session_replication_role = origin;
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, false, 'untagged after the 24 hours: open');
reset role;
insert into public.tag_challenges (tagger_id, tagged_id, expires_at) values
  ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d00a', now() + interval '48 hours');
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, true, 'a tag after the 24 hours locks it at once');

reset role;
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '25 hours' where id = '00000000-0000-0000-0000-0000000d0a01';
set local session_replication_role = origin;
set local role authenticated;

-- 7. The server switch and blocking.
reset role;
update public.app_config set feed_lock_enabled = false;
set local role authenticated;
select is((pg_temp.feed() ->> 'locked')::boolean, false, 'the lock can be switched off on the server');

reset role;
insert into public.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d00a');
set local role authenticated;
select is(pg_temp.ids(pg_temp.feed()),
  '00000000-0000-0000-0000-0000000d0c01,00000000-0000-0000-0000-0000000d0a01',
  'blocked people drop out of the feed');

select * from finish();
rollback;
