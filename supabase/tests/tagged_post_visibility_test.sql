-- Tagged people see the post they're tagged in (owner, 2026-10-08; 20261008170000_private_accounts):
-- * per post, not per owner: a person tagged on a post (post_tags, or a started tag on it in
--   tag_challenges) sees that post, its photo, its comments and likes, and can like and comment,
--   even when the poster is private or followers/friends-only and they don't follow
-- * the poster's other posts stay closed to them
-- * a block or a ban still wins; the feed lock still applies (padlocks), as for every other post
-- * an untagged stranger is still refused
-- * the other way round (owner, 2026-10-08): the person who tagged you sees the post that answers
--   their tag (tag_challenges.answered_post_id), only that post, with the same block, ban and
--   feed-lock rules
begin;
select plan(32);

update public.app_config set feed_lock_enabled = false, tags_required = false;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000009a04' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.post(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000009a05' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.sees(p_post text) returns boolean language sql as $$
  select exists (select 1 from public.posts where id = pg_temp.post(p_post))
$$;
create function pg_temp.sees_file(p_post text) returns boolean language sql as $$
  select exists (select 1 from storage.objects
                 where bucket_id = 'posts' and name = pg_temp.uid('o')::text || '/' || p_post || '.jpg')
$$;

-- o is private and posts t (tags z and b; c's tag is a started slot) and u (tags nobody).
-- z is tagged and doesn't follow; c is tagged through a slot only; b is tagged but o blocked b;
-- s is an untagged stranger.
-- a is friends-only and answers g's and k's tags with post w (x is another post of a's); g doesn't
-- follow a; a blocked k; h is someone else.
insert into auth.users (id, email)
select pg_temp.uid(c), 'tpv-' || c || '@example.invalid'
from unnest(array['o','z','c','b','s','a','g','k','h']) c;
insert into public.profiles (id, username, is_private, posts_visibility)
select pg_temp.uid(c), 'tpv_' || c, c = 'o',
       case when c = 'o' then 'followers' when c = 'a' then 'friends' else 'everyone' end
from unnest(array['o','z','c','b','s','a','g','k','h']) c;
insert into public.posts (id, user_id, image_url, image_path, streak_day) values
  (pg_temp.post('w'), pg_temp.uid('a'), 'x', pg_temp.uid('a')::text || '/w.jpg', 1),
  (pg_temp.post('x'), pg_temp.uid('a'), 'x', pg_temp.uid('a')::text || '/x.jpg', 2);
insert into storage.objects (bucket_id, name) values
  ('posts', pg_temp.uid('a')::text || '/w.jpg'), ('posts', pg_temp.uid('a')::text || '/x.jpg');
insert into public.tag_challenges (tagger_id, tagged_id, expires_at, started_at, answered_at, answered_post_id)
values
  (pg_temp.uid('g'), pg_temp.uid('a'), now() + interval '40 hours', now() - interval '8 hours', now(), pg_temp.post('w')),
  (pg_temp.uid('k'), pg_temp.uid('a'), now() + interval '40 hours', now() - interval '8 hours', now(), pg_temp.post('w'));
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('k'));
create function pg_temp.sees_a(p_post text) returns boolean language sql as $$
  select exists (select 1 from public.posts where id = pg_temp.post(p_post))
     and exists (select 1 from storage.objects
                 where bucket_id = 'posts' and name = pg_temp.uid('a')::text || '/' || p_post || '.jpg')
$$;
insert into public.posts (id, user_id, image_url, image_path, streak_day) values
  (pg_temp.post('t'), pg_temp.uid('o'), 'x', pg_temp.uid('o')::text || '/t.jpg', 1),
  (pg_temp.post('u'), pg_temp.uid('o'), 'x', pg_temp.uid('o')::text || '/u.jpg', 2);
insert into storage.objects (bucket_id, name) values
  ('posts', pg_temp.uid('o')::text || '/t.jpg'), ('posts', pg_temp.uid('o')::text || '/u.jpg');
insert into public.post_tags (post_id, user_id) values
  (pg_temp.post('t'), pg_temp.uid('z')), (pg_temp.post('t'), pg_temp.uid('b'));
-- A slot whose tag has started but whose bubble row isn't there (only tag_challenges says so).
insert into public.tag_challenges (post_id, tagger_id, tagged_id, expires_at, started_at)
values (pg_temp.post('t'), pg_temp.uid('o'), pg_temp.uid('c'), now() + interval '48 hours', now());
delete from public.post_tags where post_id = pg_temp.post('t') and user_id = pg_temp.uid('c');
insert into public.post_comments (post_id, user_id, content) values (pg_temp.post('t'), pg_temp.uid('o'), 'go');
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('o'), pg_temp.uid('b'));

-- 1. The tagged person.
select pg_temp.as_user('z');
select ok(pg_temp.sees('t'), 'a tagged person sees the post they are tagged in');
select ok(pg_temp.sees_file('t'), 'and its photo');
select is((select count(*)::int from public.post_comments where post_id = pg_temp.post('t')), 1,
  'and its comments');
select lives_ok($$select public.toggle_like(pg_temp.post('t'), pg_temp.uid('z'))$$, 'and can like it');
select lives_ok($$insert into public.post_comments (post_id, user_id, content)
                  values (pg_temp.post('t'), pg_temp.uid('z'), 'on it')$$, 'and comment');
select is((select count(*)::int from public.post_likes where post_id = pg_temp.post('t')), 1,
  'and reads its likes');
select is((select count(*)::int from public.get_comment_likes(pg_temp.post('t'))), 2,
  'and its comment likes');
select ok(not pg_temp.sees('u') and not pg_temp.sees_file('u'),
  'but not the poster''s other posts');
select is((select jsonb_agg(i ->> 'id') from jsonb_array_elements(public.get_user_posts(pg_temp.uid('o')) -> 'items') i),
  jsonb_build_array(pg_temp.post('t')::text),
  'the closed profile still holds only the tagged post, so a notification can open it');
select is(public.get_user_posts(pg_temp.uid('o')) ->> 'restricted', 'private', 'the profile still says private');
select is((public.get_user_posts(pg_temp.uid('o')) -> 'items' -> 0 ->> 'locked'), 'false',
  'and the tagged post is open there');

-- 2. Tagged through a slot only.
select pg_temp.as_user('c');
select ok(pg_temp.sees('t') and pg_temp.sees_file('t'), 'a started slot tag counts too');
select ok(not pg_temp.sees('u'), 'and only for that post');

-- 3. Blocks win.
select pg_temp.as_user('b');
select ok(not pg_temp.sees('t') and not pg_temp.sees_file('t'), 'a blocked tagged person sees nothing');
select throws_ok($$select public.toggle_like(pg_temp.post('t'), pg_temp.uid('b'))$$,
  '42501', 'not allowed', 'and cannot like it');

-- 4. An untagged stranger is still refused.
select pg_temp.as_user('s');
select ok(not pg_temp.sees('t') and not pg_temp.sees_file('t'), 'an untagged stranger sees nothing');
select is((select count(*)::int from public.post_comments where post_id = pg_temp.post('t')), 0,
  'nor its comments');

-- 5. The tagger sees the answer to their tag.
select pg_temp.as_user('g');
select ok(pg_temp.sees_a('w'), 'the tagger sees the post that answers their tag, and its photo');
select lives_ok($$select public.toggle_like(pg_temp.post('w'), pg_temp.uid('g'))$$, 'and can like it');
select lives_ok($$insert into public.post_comments (post_id, user_id, content)
                  values (pg_temp.post('w'), pg_temp.uid('g'), 'nice')$$, 'and comment');
select ok(not exists (select 1 from public.posts where id = pg_temp.post('x'))
          and not exists (select 1 from storage.objects where bucket_id = 'posts'
                          and name = pg_temp.uid('a')::text || '/x.jpg'),
  'but not the answerer''s other posts');
select throws_ok($$insert into public.post_comments (post_id, user_id, content)
                   values (pg_temp.post('x'), pg_temp.uid('g'), 'hi')$$,
  '42501', null, 'nor comment on them');
select is((select jsonb_agg(i ->> 'id') from jsonb_array_elements(public.get_user_posts(pg_temp.uid('a')) -> 'items') i),
  jsonb_build_array(pg_temp.post('w')::text), 'the closed profile holds only the answer');
select is(public.get_user_posts(pg_temp.uid('a')) ->> 'restricted', 'friends', 'and still says friends only');
select pg_temp.as_user('h');
select ok(not pg_temp.sees_a('w'), 'someone who didn''t tag them sees nothing');
select throws_ok($$select public.toggle_like(pg_temp.post('w'), pg_temp.uid('h'))$$,
  '42501', 'not allowed', 'and cannot like it');
select pg_temp.as_user('k');
select ok(not pg_temp.sees_a('w'), 'a blocked tagger sees nothing');

-- 6. The feed lock still applies.
reset role;
update public.app_config set feed_lock_enabled = true;
select pg_temp.as_user('z');
select ok(not pg_temp.sees('t'), 'a feed-locked tagged person waits, like everyone else');
select ok((select (i ->> 'locked')::boolean and i ->> 'image_path' is null
           from jsonb_array_elements(public.get_user_posts(pg_temp.uid('o')) -> 'items') i),
  'and gets a padlock on the profile');
select pg_temp.as_user('g');
select ok(not pg_temp.sees_a('w'), 'so does a feed-locked tagger');

-- 7. Bans win.
reset role;
update public.app_config set feed_lock_enabled = false;
update public.profiles set is_banned = true where id = pg_temp.uid('o');
select pg_temp.as_user('z');
select ok(not pg_temp.sees('t'), 'nobody sees a banned person''s post, tagged or not');
reset role;
update public.profiles set is_banned = true where id = pg_temp.uid('a');
select pg_temp.as_user('g');
select ok(not pg_temp.sees_a('w'), 'nor a banned answerer''s answer, even the tagger');

select * from finish();
rollback;
