-- Sharing a post into a Mahi chat (owner, 2026-10-10: a share sheet like Instagram's, with a grid of
-- friends to send to). share_post sends the post to 1-10 people as a message that carries the post;
-- the reader gets the post only if the usual rules let them see it (no exception for shares).
-- Migration: 20261010100000_share_post_in_message.
begin;
select plan(27);

update public.app_config set feed_lock_enabled = false, quiet_start = '00:00', quiet_end = '00:00';

-- A sends. B is A's friend. C is a stranger to A. E has blocked A. P is private; A follows P
-- (approved), B and C don't. S is a stranger who reads nothing.
create function pg_temp.uid(p_who text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000005a700' || p_who)::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'shp-' || c || '@example.invalid' from unnest(array['a','b','c','e','f','d']) c;
insert into public.profiles (id, username, display_name)
select pg_temp.uid(c), 'shp_' || c, case when c = 'a' then 'Ada' end
from unnest(array['a','b','c','e','f','d']) c;
-- f is the private poster, d the stranger.
update public.profiles set is_private = true, posts_visibility = 'followers' where id = pg_temp.uid('f');
insert into public.follows (follower_id, following_id) values
  (pg_temp.uid('a'), pg_temp.uid('b')), (pg_temp.uid('b'), pg_temp.uid('a')),
  (pg_temp.uid('a'), pg_temp.uid('f'));
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('e'), pg_temp.uid('a'));

set local session_replication_role = replica;
insert into public.posts (id, user_id, image_url, image_path, caption, streak_day, created_at, post_date) values
  ('00000000-0000-0000-0000-00005a700001', pg_temp.uid('a'), 'x', pg_temp.uid('a')::text || '/a1.jpg', 'mine', 1, now(), current_date),
  ('00000000-0000-0000-0000-00005a700002', pg_temp.uid('f'), 'x', pg_temp.uid('f')::text || '/secret.jpg', 'private one', 1, now(), current_date);
set local session_replication_role = origin;

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p_who), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.convo(p_x text, p_y text) returns uuid language sql as $$
  select id from public.conversations
  where participant_one = least(pg_temp.uid(p_x), pg_temp.uid(p_y))
    and participant_two = greatest(pg_temp.uid(p_x), pg_temp.uid(p_y))
$$;
create function pg_temp.share(p_post int, p_to text[], p_client int, p_note text default null)
returns jsonb language sql as $$
  select public.share_post(
    ('00000000-0000-0000-0000-00005a70000' || p_post)::uuid,
    array(select pg_temp.uid(t) from unnest(p_to) t),
    ('44444444-0000-0000-0000-00000000000' || p_client)::uuid,
    p_note)
$$;

-- The `post` part of a message that carries this post (every message here is made in one
-- transaction, so they share a timestamp: find them by post, never by position).
create function pg_temp.post_part(p_messages jsonb, p_post text) returns jsonb language sql as $$
  select e -> 'post' from jsonb_array_elements(p_messages) e where e ->> 'post_id' = p_post limit 1
$$;

-- 1. Signed out is refused.
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select pg_temp.share(1, array['b'], 1)$$, '42501', null, 'signed out cannot share');
reset role;

-- 2. To a friend: the post lands in the chat.
select pg_temp.as_user('a');
create temp table r1 as select pg_temp.share(1, array['b'], 1) as j;
reset role;
select is((select jsonb_array_length(j -> 'sent') from r1), 1, 'sent to the friend');
select is((select j -> 'sent' -> 0 ->> 'status' from r1), 'active', 'a friend''s chat is open');
select is((select post_id from public.messages where conversation_id = pg_temp.convo('a', 'b')),
  '00000000-0000-0000-0000-00005a700001'::uuid, 'the message carries the post');
select is((select content from public.messages where conversation_id = pg_temp.convo('a', 'b')), '',
  'no note: the words are empty');
select is((select body from public.push_outbox where user_id = pg_temp.uid('b') and kind = 'message'),
  'Ada sent you a post', 'the push says a post was sent');

-- 3. The friend reads it: the post itself, as a feed item.
select pg_temp.as_user('b');
create temp table m1 as select public.get_messages(pg_temp.convo('a', 'b')) as j;
create temp table i1 as select last_message from public.get_inbox('active');
reset role;
select is((select (pg_temp.post_part(j, '00000000-0000-0000-0000-00005a700001') ->> 'available')::boolean from m1), true, 'the reader can open it');
select is((select pg_temp.post_part(j, '00000000-0000-0000-0000-00005a700001') -> 'item' ->> 'id' from m1), '00000000-0000-0000-0000-00005a700001',
  'with the post as a feed item');
select is((select last_message from i1), 'Sent a post', 'the inbox line says a post was sent');

-- 4. A retry with the same client id makes no second message.
select pg_temp.as_user('a');
select lives_ok($$select pg_temp.share(1, array['b'], 1)$$, 'a retry is fine');
reset role;
select is((select count(*)::int from public.messages where conversation_id = pg_temp.convo('a', 'b')), 1,
  'and makes no second message');

-- 5. With a note.
select pg_temp.as_user('a');
select lives_ok($$select pg_temp.share(1, array['b'], 2, '  look at this  ')$$, 'a note goes with it');
reset role;
select is((select content from public.messages where conversation_id = pg_temp.convo('a', 'b')
           and content <> ''), 'look at this', 'trimmed');

-- 6. To someone who isn't a friend: a message request. A second one waits and is skipped.
select pg_temp.as_user('a');
create temp table r2 as select pg_temp.share(1, array['c'], 3) as j;
create temp table r3 as select pg_temp.share(1, array['c', 'b'], 4) as j;
reset role;
select is((select j -> 'sent' -> 0 ->> 'status' from r2), 'requested', 'a stranger gets it as a request');
select is((select j -> 'skipped' ->> 0 from r3), pg_temp.uid('c')::text, 'a waiting request is skipped');
select is((select jsonb_array_length(j -> 'sent') from r3), 1, 'while the friend still gets it');

-- 7. Someone who blocked you is skipped, not an error.
select pg_temp.as_user('a');
create temp table r4 as select pg_temp.share(1, array['e'], 5) as j;
reset role;
select is((select j -> 'skipped' ->> 0 from r4), pg_temp.uid('e')::text, 'a block is skipped');
select is((select count(*)::int from public.conversations
           where pg_temp.uid('e') in (participant_one, participant_two)), 0, 'and leaves no chat behind');

-- 8. How many: 1 to 10.
select pg_temp.as_user('a');
select throws_ok($$select pg_temp.share(1, array[]::text[], 6)$$, '22023', 'share with 1 to 10 people', 'nobody picked');
reset role;

-- 9. You can only share a post you can see.
select pg_temp.as_user('c');
select throws_ok($$select pg_temp.share(2, array['b'], 7)$$, '42501', 'post not found',
  'a stranger cannot share a private post');
select throws_ok(
  $$select public.share_post('00000000-0000-0000-0000-00005a7000ff', array[pg_temp.uid('b')], gen_random_uuid(), null)$$,
  '42501', 'post not found', 'nor one that does not exist');
reset role;

-- 10. A shared post follows the usual rules for the reader: B can't see F's private post.
select pg_temp.as_user('a');
select lives_ok($$select pg_temp.share(2, array['b'], 8)$$, 'A (a follower) shares the private post');
reset role;
select pg_temp.as_user('b');
create temp table m2 as select public.get_messages(pg_temp.convo('a', 'b')) as j;
reset role;
select is((select pg_temp.post_part(j, '00000000-0000-0000-0000-00005a700002') ->> 'reason' from m2), 'private', 'the reader is told it is private');
select ok((select j::text not like '%secret.jpg%' and j::text not like '%private one%' from m2),
  'and gets nothing of the post');

-- 11. A reader whose feed is locked: locked, not the post.
update public.app_config set feed_lock_enabled = true;
select pg_temp.as_user('b');
create temp table m3 as select public.get_messages(pg_temp.convo('a', 'b')) as j;
reset role;
select is((select pg_temp.post_part(j, '00000000-0000-0000-0000-00005a700001') ->> 'reason' from m3), 'locked', 'a locked feed keeps a shared post shut too');
update public.app_config set feed_lock_enabled = false;

-- 12. A deleted post: gone.
delete from public.posts where id = '00000000-0000-0000-0000-00005a700001';
select pg_temp.as_user('b');
create temp table m4 as select public.get_messages(pg_temp.convo('a', 'b')) as j;
reset role;
select is((select pg_temp.post_part(j, '00000000-0000-0000-0000-00005a700001') ->> 'reason' from m4), 'gone', 'a deleted post says so');

-- 13. A stranger to the chat reads nothing.
select pg_temp.as_user('d');
select throws_ok(format('select public.get_messages(%L)', pg_temp.convo('a', 'b')), '42501', null,
  'someone outside the chat cannot read it');
reset role;

select * from finish();
rollback;
