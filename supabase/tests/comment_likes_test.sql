-- Comment likes (flag comment-likes): a heart on each comment, its count, and who liked it.
-- a posts and comments (ca); b comments too (cb). a blocks c. d blocks b. e is banned.
begin;
select plan(18);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000c1e0' || c)::uuid, 'cl-' || c || '@example.invalid'
from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) c;
insert into public.profiles (id, username)
select ('00000000-0000-0000-0000-0000000c1e0' || c)::uuid, 'cl_' || c
from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) c;
update public.profiles set is_banned = true where id = '00000000-0000-0000-0000-0000000c1e0e';
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000c1e0a', '00000000-0000-0000-0000-0000000c1e0c'),
  ('00000000-0000-0000-0000-0000000c1e0d', '00000000-0000-0000-0000-0000000c1e0b');
-- Everyone follows a and the feed lock is off, so a's post is visible to them
-- (20261008120000_comment_like_visibility: comment likes follow the post).
update public.app_config set feed_lock_enabled = false;
insert into public.follows (follower_id, following_id)
select ('00000000-0000-0000-0000-0000000c1e0' || c)::uuid, '00000000-0000-0000-0000-0000000c1e0a'
from unnest(array['b', 'c', 'd', 'e', 'f']) c;
insert into public.posts (id, user_id, image_url, streak_day)
values ('00000000-0000-0000-0000-0000000c1e99', '00000000-0000-0000-0000-0000000c1e0a', 'x', 1);
insert into public.post_comments (id, post_id, user_id, content) values
  ('00000000-0000-0000-0000-0000000c1ea1', '00000000-0000-0000-0000-0000000c1e99',
   '00000000-0000-0000-0000-0000000c1e0a', 'from a'),
  ('00000000-0000-0000-0000-0000000c1eb1', '00000000-0000-0000-0000-0000000c1e99',
   '00000000-0000-0000-0000-0000000c1e0b', 'from b'),
  ('00000000-0000-0000-0000-0000000c1ec1', '00000000-0000-0000-0000-0000000c1e99',
   '00000000-0000-0000-0000-0000000c1e0c', 'from c');

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object(
           'sub', '00000000-0000-0000-0000-0000000c1e0' || p_who, 'role', 'authenticated')::text, true);
$$;

select has_table('public', 'comment_likes', 'comment_likes exists');

-- Like and unlike, as yourself.
select pg_temp.as_user('b');
select is(
  (select row(liked, like_count)::text from public.toggle_comment_like('00000000-0000-0000-0000-0000000c1ea1')),
  '(t,1)', 'b likes a''s comment: liked, one like');
select is(
  (select row(liked, like_count)::text from public.toggle_comment_like('00000000-0000-0000-0000-0000000c1ea1')),
  '(f,0)', 'and unlikes it');
select throws_ok(
  $$insert into public.comment_likes (comment_id, user_id)
    values ('00000000-0000-0000-0000-0000000c1ea1', '00000000-0000-0000-0000-0000000c1e0f')$$,
  '42501', null, 'you cannot like on someone else''s behalf');

-- Blocked either way: no like.
reset role;
select pg_temp.as_user('c');
select throws_ok(
  $$select * from public.toggle_comment_like('00000000-0000-0000-0000-0000000c1ea1')$$,
  '42501', null, 'someone the commenter blocked cannot like their comment');
select throws_ok(
  $$insert into public.comment_likes (comment_id, user_id)
    values ('00000000-0000-0000-0000-0000000c1ea1', '00000000-0000-0000-0000-0000000c1e0c')$$,
  '42501', null, 'not by writing the row either');
reset role;
select pg_temp.as_user('a');
select throws_ok(
  $$select * from public.toggle_comment_like('00000000-0000-0000-0000-0000000c1ec1')$$,
  '42501', null, 'nor can the one who blocked like the other''s comment');
select throws_ok(
  $$select * from public.toggle_comment_like('00000000-0000-0000-0000-0000000c1e77')$$,
  '42501', null, 'a comment that does not exist cannot be liked');

-- Likes from b, d, e (banned) and f on a's comment.
reset role;
insert into public.comment_likes (comment_id, user_id, created_at)
select '00000000-0000-0000-0000-0000000c1ea1', ('00000000-0000-0000-0000-0000000c1e0' || c)::uuid,
       now() - (n || ' minutes')::interval
from unnest(array['b', 'd', 'e', 'f']) with ordinality as t(c, n);

-- Counts and "liked by me" for every comment on the post.
select pg_temp.as_user('b');
select is(
  (select array_agg(row(comment_id, like_count, liked_by_me)::text order by comment_id)
   from public.get_comment_likes('00000000-0000-0000-0000-0000000c1e99')),
  array['(00000000-0000-0000-0000-0000000c1ea1,4,t)', '(00000000-0000-0000-0000-0000000c1eb1,0,f)',
        '(00000000-0000-0000-0000-0000000c1ec1,0,f)'],
  'each comment comes back with its like count and whether you liked it');

-- Who liked it: newest first, without anyone blocked either way or banned.
select is(
  (select array_agg(username order by ord)
   from public.get_comment_likers('00000000-0000-0000-0000-0000000c1ea1') with ordinality as l(user_id, username, display_name, avatar_url, liked_at, ord)),
  array['cl_b', 'cl_f'],
  'b sees who liked it, minus d (who blocks b) and e (banned)');
reset role;
select pg_temp.as_user('a');
select is(
  (select array_agg(username order by ord)
   from public.get_comment_likers('00000000-0000-0000-0000-0000000c1ea1') with ordinality as l(user_id, username, display_name, avatar_url, liked_at, ord)),
  array['cl_b', 'cl_d', 'cl_f'],
  'a sees b, d and f, newest first');

-- You can take back only your own like.
reset role;
select pg_temp.as_user('b');
delete from public.comment_likes where user_id = '00000000-0000-0000-0000-0000000c1e0f';
reset role;
select is((select count(*)::int from public.comment_likes where user_id = '00000000-0000-0000-0000-0000000c1e0f'), 1,
  'b cannot delete f''s like');
select pg_temp.as_user('b');
delete from public.comment_likes where user_id = '00000000-0000-0000-0000-0000000c1e0b';
reset role;
select is((select count(*)::int from public.comment_likes where user_id = '00000000-0000-0000-0000-0000000c1e0b'), 0,
  'b can delete their own like');

-- Signed-in only.
select ok(not has_function_privilege('anon', 'public.toggle_comment_like(uuid)', 'execute'),
  'anon cannot like');
select ok(has_function_privilege('authenticated', 'public.toggle_comment_like(uuid)', 'execute'),
  'signed-in users can like');
select ok(not has_function_privilege('anon', 'public.get_comment_likers(uuid)', 'execute'),
  'anon cannot list who liked');
select set_config('role', 'anon', true);
select throws_ok($$select count(*) from public.comment_likes$$, '42501', null,
  'anon cannot read likes (no table rights since 20261008150000)');
reset role;

-- A deleted comment takes its likes with it.
delete from public.post_comments where id = '00000000-0000-0000-0000-0000000c1ea1';
select is((select count(*)::int from public.comment_likes where comment_id = '00000000-0000-0000-0000-0000000c1ea1'), 0,
  'deleting a comment deletes its likes');

select * from finish();
rollback;
