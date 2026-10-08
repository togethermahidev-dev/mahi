-- Comments and likes follow the post (20261008120000_comment_like_visibility): you read the comments,
-- likes and comment likes of a post only when you may see the post (yours, or visible and allowed
-- by the feed rule: you follow them, no block either way, they are not banned, your feed is not
-- locked); your own comments you always read. Staff read every comment, removed ones too. Liking a comment needs the same, and the
-- comment must not be removed.
begin;
select plan(14);

update public.app_config set feed_lock_enabled = false, tags_required = false;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000c7' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.post() returns uuid language sql immutable as $$
  select '00000000-0000-0000-0000-0000000c7a01'::uuid
$$;
create function pg_temp.comment(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000c7c' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;

-- a posts; b follows a; c follows nobody; d follows a but a blocked d; s is staff.
insert into auth.users (id, email)
select pg_temp.uid(c), 'clv-' || c || '@example.invalid' from unnest(array['a','b','c','d','s']) c;
insert into public.profiles (id, username)
select pg_temp.uid(c), 'clv_' || c from unnest(array['a','b','c','d','s']) c;
-- a's workouts are for approved followers only (since 20261008170000 a public account's are open
-- to anyone signed in).
update public.profiles set is_private = true, posts_visibility = 'followers' where id = pg_temp.uid('a');
-- Staff need a confirmed email (20261008110000_staff_confirmed_email).
update auth.users set email_confirmed_at = now() where id in (pg_temp.uid('s'));
insert into public.staff_users (user_id, role) values (pg_temp.uid('s'), 'admin');
insert into public.follows (follower_id, following_id) values
  (pg_temp.uid('b'), pg_temp.uid('a')),
  (pg_temp.uid('d'), pg_temp.uid('a'));
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('d'));

-- a's post with b's comment 'k' (kept), b's comment 'r' (removed), b's like, a's like on 'k'.
insert into public.posts (id, user_id, image_url, image_path, streak_day)
values (pg_temp.post(), pg_temp.uid('a'), 'x', pg_temp.uid('a')::text || '/p.jpg', 1);
insert into public.post_comments (id, post_id, user_id, content, removed_at) values
  (pg_temp.comment('k'), pg_temp.post(), pg_temp.uid('b'), 'nice', null),
  (pg_temp.comment('r'), pg_temp.post(), pg_temp.uid('b'), 'gone', now());
insert into public.post_likes (post_id, user_id) values (pg_temp.post(), pg_temp.uid('b'));
insert into public.comment_likes (comment_id, user_id) values (pg_temp.comment('k'), pg_temp.uid('a'));

create function pg_temp.comments() returns int language sql as $$
  select count(*)::int from public.post_comments where post_id = pg_temp.post()
$$;
create function pg_temp.likes() returns int language sql as $$
  select count(*)::int from public.post_likes where post_id = pg_temp.post()
$$;
create function pg_temp.comment_likes() returns int language sql as $$
  select count(*)::int from public.comment_likes where comment_id = pg_temp.comment('k')
$$;

-- 1. Reading.
select pg_temp.as_user('b');
select is(pg_temp.comments(), 1, 'a follower reads the kept comment, not the removed one');
select is(pg_temp.likes(), 1, 'a follower reads the likes');
select is(pg_temp.comment_likes(), 1, 'a follower reads the comment likes');
select pg_temp.as_user('c');
select is(pg_temp.comments() + pg_temp.likes() + pg_temp.comment_likes(), 0,
  'someone who does not follow reads no comments, likes or comment likes');
select pg_temp.as_user('d');
select is(pg_temp.comments() + pg_temp.likes() + pg_temp.comment_likes(), 0,
  'someone blocked reads none, even while following');
select pg_temp.as_user('a');
select is(pg_temp.comments(), 1, 'the owner reads the comments on their own post');
select pg_temp.as_user('s');
select is(pg_temp.comments(), 2, 'staff read every comment, removed ones too');
reset role;
update public.app_config set feed_lock_enabled = true;
select pg_temp.as_user('b');
select is(pg_temp.likes(), 0, 'a follower whose feed is locked reads no likes');
select is(pg_temp.comments(), 1, 'and only their own comment');
reset role;
update public.app_config set feed_lock_enabled = false;

-- 2. Liking a comment.
select pg_temp.as_user('c');
select throws_ok($$select public.toggle_comment_like(pg_temp.comment('k'))$$,
  '42501', null, 'no liking a comment on a post you cannot see');
select throws_ok(
  $$insert into public.comment_likes (comment_id, user_id) values (pg_temp.comment('k'), pg_temp.uid('c'))$$,
  '42501', null, 'no direct comment like on a post you cannot see');
select pg_temp.as_user('b');
select throws_ok($$select public.toggle_comment_like(pg_temp.comment('r'))$$,
  '42501', null, 'no liking a removed comment');
select is((select liked from public.toggle_comment_like(pg_temp.comment('k'))), true,
  'a follower can like a comment');
select is((select liked from public.toggle_comment_like(pg_temp.comment('k'))), false,
  'and take the like back');
reset role;

select * from finish();
rollback;
