-- Deleting an account: the delete-account function removes the auth user, and every row that
-- belongs to that person goes with it (ON DELETE CASCADE), while the other person's own things stay.
begin;
select plan(19);

update public.app_config set quiet_start = '00:00', quiet_end = '00:00';

-- A is deleted. B and C stay.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000de1a0', 'del-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000de1b0', 'del-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000de1c0', 'del-c@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000de1a0', 'del_a', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000de1b0', 'del_b', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000de1c0', 'del_c', 'Europe/London');

create temp table ids as select
  '00000000-0000-0000-0000-0000000de1a0'::uuid as a,
  '00000000-0000-0000-0000-0000000de1b0'::uuid as b,
  '00000000-0000-0000-0000-0000000de1c0'::uuid as c;

insert into public.follows (follower_id, following_id)
select a, b from ids union all select b, a from ids union all select b, c from ids;

insert into public.posts (id, user_id, image_url, streak_day)
select '00000000-0000-0000-0000-0000000de1a1'::uuid, a, 'a.jpg', 1 from ids union all
select '00000000-0000-0000-0000-0000000de1b1'::uuid, b, 'b.jpg', 1 from ids;

insert into public.post_likes (post_id, user_id) values
  ('00000000-0000-0000-0000-0000000de1a1', '00000000-0000-0000-0000-0000000de1b0'),
  ('00000000-0000-0000-0000-0000000de1b1', '00000000-0000-0000-0000-0000000de1a0');
insert into public.post_comments (post_id, user_id, content) values
  ('00000000-0000-0000-0000-0000000de1a1', '00000000-0000-0000-0000-0000000de1b0', 'nice'),
  ('00000000-0000-0000-0000-0000000de1b1', '00000000-0000-0000-0000-0000000de1a0', 'hi');
insert into public.post_tags (post_id, user_id) values
  ('00000000-0000-0000-0000-0000000de1a1', '00000000-0000-0000-0000-0000000de1b0'),
  ('00000000-0000-0000-0000-0000000de1b1', '00000000-0000-0000-0000-0000000de1a0');

-- One chat A started with B, one C started with A, and one between B and C.
insert into public.conversations (id, participant_one, participant_two, initiated_by, status) values
  ('00000000-0000-0000-0000-0000000de1c1', '00000000-0000-0000-0000-0000000de1a0', '00000000-0000-0000-0000-0000000de1b0', '00000000-0000-0000-0000-0000000de1a0', 'active'),
  ('00000000-0000-0000-0000-0000000de1c2', '00000000-0000-0000-0000-0000000de1a0', '00000000-0000-0000-0000-0000000de1c0', '00000000-0000-0000-0000-0000000de1c0', 'active'),
  ('00000000-0000-0000-0000-0000000de1c3', '00000000-0000-0000-0000-0000000de1b0', '00000000-0000-0000-0000-0000000de1c0', '00000000-0000-0000-0000-0000000de1b0', 'active');
insert into public.messages (conversation_id, sender_id, content) values
  ('00000000-0000-0000-0000-0000000de1c1', '00000000-0000-0000-0000-0000000de1a0', 'hey'),
  ('00000000-0000-0000-0000-0000000de1c1', '00000000-0000-0000-0000-0000000de1b0', 'yo'),
  ('00000000-0000-0000-0000-0000000de1c2', '00000000-0000-0000-0000-0000000de1c0', 'hello'),
  ('00000000-0000-0000-0000-0000000de1c3', '00000000-0000-0000-0000-0000000de1c0', 'bc');
insert into public.conversation_reads (conversation_id, user_id)
select '00000000-0000-0000-0000-0000000de1c1', a from ids;

insert into public.user_blocks (blocker_id, blocked_id) select a, c from ids;
insert into public.user_reports (reporter_id, reported_user_id, reason) select a, c, 'spam' from ids;
insert into public.user_reports (reporter_id, reported_user_id, reason) select b, a, 'spam' from ids;
insert into public.push_tokens (user_id, token, platform) select a, 'tok-a', 'ios' from ids;
insert into public.streak_logs (user_id, started_at) select a, current_date from ids;

-- The rule itself: the chat's starter no longer blocks the delete.
select is(
  (select confdeltype::text from pg_constraint where conname = 'conversations_initiated_by_fkey'),
  'c', 'a chat goes when the person who started it is deleted');

select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-0000000de1a0'$$,
  'the account can be deleted');

select is((select count(*)::int from public.profiles where id = (select a from ids)), 0, 'profile gone');
select is((select count(*)::int from public.posts where user_id = (select a from ids)), 0, 'posts gone');
select is((select count(*)::int from public.post_likes where user_id = (select a from ids)), 0, 'their likes gone');
select is((select count(*)::int from public.post_comments where user_id = (select a from ids)), 0, 'their comments gone');
select is((select count(*)::int from public.post_tags where user_id = (select a from ids)), 0, 'tags of them gone');
select is((select count(*)::int from public.follows
  where follower_id = (select a from ids) or following_id = (select a from ids)), 0, 'follows gone');
select is((select count(*)::int from public.conversations
  where (select a from ids) in (participant_one, participant_two, initiated_by)), 0, 'their chats gone');
select is((select count(*)::int from public.messages where sender_id = (select a from ids)), 0, 'their messages gone');
select is((select count(*)::int from public.notifications
  where user_id = (select a from ids) or actor_id = (select a from ids)), 0, 'notifications gone');
select is((select count(*)::int from public.user_blocks where blocker_id = (select a from ids)), 0, 'their blocks gone');
select is((select count(*)::int from public.user_reports
  where reporter_id = (select a from ids) or reported_user_id = (select a from ids)), 0, 'reports by and about them gone');
select is((select count(*)::int from public.push_tokens where user_id = (select a from ids)), 0, 'push tokens gone');
select is((select count(*)::int from public.streak_logs where user_id = (select a from ids)), 0, 'streak gone');

select is((select count(*)::int from public.profiles where id in (select b from ids union select c from ids)), 2,
  'the other people stay');
select is((select count(*)::int from public.posts where user_id = (select b from ids)), 1, 'their posts stay');
select is((select count(*)::int from public.conversations where id = '00000000-0000-0000-0000-0000000de1c3'), 1,
  'chats between other people stay');
select is((select count(*)::int from public.messages where conversation_id = '00000000-0000-0000-0000-0000000de1c3'), 1,
  'and so do their messages');

select * from finish();
rollback;
