-- Message requests, edits and unsends (owner, 2026-10-06: "the server is the truth").
-- A request is the first message from someone who isn't a friend; friends message directly; the
-- receiver accepts, declines or blocks; a sender edits (15 minutes) or unsends their own message.
begin;
select plan(45);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b100a', 'req-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000b100b', 'req-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000b100c', 'req-c@example.invalid'),
  ('00000000-0000-0000-0000-0000000b100d', 'req-d@example.invalid'),
  ('00000000-0000-0000-0000-0000000b100e', 'req-e@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000b100a', 'req_a'),
  ('00000000-0000-0000-0000-0000000b100b', 'req_b'),
  ('00000000-0000-0000-0000-0000000b100c', 'req_c'),
  ('00000000-0000-0000-0000-0000000b100d', 'req_d'),
  ('00000000-0000-0000-0000-0000000b100e', 'req_e');
-- C and D are friends (they follow each other).
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-0000000b100c', '00000000-0000-0000-0000-0000000b100d'),
  ('00000000-0000-0000-0000-0000000b100d', '00000000-0000-0000-0000-0000000b100c');

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', '00000000-0000-0000-0000-0000000b100' || p_who, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.uid(p_who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000b100' || p_who)::uuid
$$;
create function pg_temp.convo(p_x text, p_y text) returns uuid language sql as $$
  select id from public.conversations
  where participant_one = least(pg_temp.uid(p_x), pg_temp.uid(p_y))
    and participant_two = greatest(pg_temp.uid(p_x), pg_temp.uid(p_y))
$$;

-- 1. Opening a chat makes nothing; the first message is the request.
select pg_temp.as_user('a');
select is((select count(*)::int from public.get_conversation_with(pg_temp.uid('b'))), 0,
  'before anything is sent there is no conversation');
select lives_ok($$select public.start_conversation(pg_temp.uid('b'), '33333333-0000-0000-0000-000000000001', 'hi b')$$,
  'A sends B a first message');
select is((public.start_conversation(pg_temp.uid('b'), '33333333-0000-0000-0000-000000000001', 'hi b') ->> 'status'),
  'requested', 'a retry hands back the same request');
reset role;
select is((select count(*)::int from public.messages where conversation_id = pg_temp.convo('a', 'b')), 1,
  'the retry made no second message');
select is((select status from public.conversations where id = pg_temp.convo('a', 'b')), 'requested',
  'between non-friends the first message is a request');
select is((select count(*)::int from public.push_outbox where user_id = pg_temp.uid('b') and kind = 'message'), 1,
  'B gets one push');
select is((select body from public.push_outbox where user_id = pg_temp.uid('b') and kind = 'message'),
  'req_a sent you a message request', 'the push says it is a request');

-- 2. While it waits, the sender can't send more and the receiver must answer first.
select pg_temp.as_user('a');
select throws_ok($$select public.send_message(pg_temp.convo('a', 'b'), gen_random_uuid(), 'hello??')$$,
  '42501', 'waiting for them to accept', 'the sender cannot send a second message');
select is((select status from public.get_inbox('active') where id = pg_temp.convo('a', 'b')), 'requested',
  'the sender sees the waiting request in their inbox');
select is((select count(*)::int from public.get_inbox('requested')), 0,
  'and not in their own requests');
select pg_temp.as_user('b');
select is((select last_message from public.get_inbox('requested') where id = pg_temp.convo('a', 'b')), 'hi b',
  'B sees the request with its message');
select is((select unread_count from public.get_inbox('requested') where id = pg_temp.convo('a', 'b')), 1,
  'and it is unread');
select is((select count(*)::int from public.get_inbox('active')), 0, 'it is not in B''s inbox yet');
select throws_ok($$select public.send_message(pg_temp.convo('a', 'b'), gen_random_uuid(), 'who dis')$$,
  '42501', 'accept the request first', 'B accepts before replying');
select is(jsonb_array_length(public.get_messages(pg_temp.convo('a', 'b'))), 1, 'B can read the request');

-- 3. Only the receiver accepts.
select pg_temp.as_user('a');
select throws_ok($$select public.accept_message_request(pg_temp.convo('a', 'b'))$$, '42501', null,
  'the sender cannot accept their own request');
select pg_temp.as_user('c');
select throws_ok($$select public.accept_message_request(pg_temp.convo('a', 'b'))$$, '42501', null,
  'nor can an outsider');
select pg_temp.as_user('b');
select lives_ok($$select public.accept_message_request(pg_temp.convo('a', 'b'))$$, 'B accepts');
select is((select status from public.get_inbox('active') where id = pg_temp.convo('a', 'b')), 'active',
  'it moves to B''s inbox');
select lives_ok($$select public.send_message(pg_temp.convo('a', 'b'), gen_random_uuid(), 'hey a')$$,
  'B can reply once accepted');
select pg_temp.as_user('a');
select lives_ok($$select public.send_message(pg_temp.convo('a', 'b'), gen_random_uuid(), 'yay')$$,
  'and A can send freely');

-- 4. Friends message directly.
select pg_temp.as_user('c');
select is((public.start_conversation(pg_temp.uid('d'), gen_random_uuid(), 'gym?') ->> 'status'), 'active',
  'friends skip the request');
select pg_temp.as_user('d');
select is((select count(*)::int from public.get_inbox('active') where id = pg_temp.convo('c', 'd')), 1,
  'it lands straight in the friend''s inbox');

-- 5. Declining is quiet: the receiver stops seeing it, the sender still sees it waiting.
select pg_temp.as_user('e');
select public.start_conversation(pg_temp.uid('b'), gen_random_uuid(), 'buy my course');
select pg_temp.as_user('b');
select lives_ok($$select public.decline_message_request(pg_temp.convo('e', 'b'))$$, 'B declines');
select is((select count(*)::int from public.get_inbox('requested') where id = pg_temp.convo('e', 'b')), 0,
  'it leaves B''s requests');
select throws_ok($$select public.accept_message_request(pg_temp.convo('e', 'b'))$$, '22023', null,
  'a declined request cannot be accepted later');
select pg_temp.as_user('e');
select is((select status from public.get_inbox('active') where id = pg_temp.convo('e', 'b')), 'requested',
  'the sender is not told');
select throws_ok($$select public.start_conversation(pg_temp.uid('b'), gen_random_uuid(), 'pls')$$,
  '42501', 'waiting for them to accept', 'and cannot send again');
select pg_temp.as_user('b');
select is((public.start_conversation(pg_temp.uid('e'), gen_random_uuid(), 'ok fine') ->> 'status'), 'active',
  'if B writes to E after all, that opens the conversation');

-- 6. Blocks and bans.
reset role;
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('d'), pg_temp.uid('a'));
select pg_temp.as_user('a');
select throws_ok($$select public.start_conversation(pg_temp.uid('d'), gen_random_uuid(), 'hi')$$,
  '42501', null, 'a blocked person cannot start a conversation');
reset role;
update public.profiles set is_banned = true where id = pg_temp.uid('e');
select pg_temp.as_user('c');
select throws_ok($$select public.start_conversation(pg_temp.uid('e'), gen_random_uuid(), 'hi')$$,
  '42501', null, 'nobody can message a banned person');
select throws_ok($$select public.start_conversation(pg_temp.uid('c'), gen_random_uuid(), 'me')$$,
  '22023', null, 'nor themselves');

-- 7. Editing your own message, within 15 minutes.
select pg_temp.as_user('a');
select is((public.edit_message((select id from public.messages where content = 'yay'), 'yay!') ->> 'content'),
  'yay!', 'the sender edits their message');
select isnt((select e ->> 'edited_at' from jsonb_array_elements(public.get_messages(pg_temp.convo('a', 'b'))) e
             where e ->> 'content' = 'yay!'), null,
  'it shows as edited');
select throws_ok($$select public.edit_message((select id from public.messages where content = 'hey a'), 'mine now')$$,
  '42501', null, 'nobody edits someone else''s message');
select throws_ok($$select public.edit_message((select id from public.messages where content = 'yay!'), '  ')$$,
  '22023', null, 'an edit cannot be empty');
reset role;
update public.messages set created_at = now() - interval '16 minutes' where content = 'hi b';
select pg_temp.as_user('a');
select throws_ok($$select public.edit_message((select id from public.messages where content = 'hi b'), 'hello b')$$,
  '22023', 'messages can be edited for 15 minutes', 'after 15 minutes it is too late');
select throws_ok($$update public.messages set content = 'sneaky' where content = 'yay!'$$, '42501', null,
  'nobody edits by writing to the table');

-- 8. Unsending your own message.
select throws_ok($$select public.unsend_message((select id from public.messages where content = 'hey a'))$$,
  '42501', null, 'nobody unsends someone else''s message');
select lives_ok($$select public.unsend_message((select id from public.messages where content = 'yay!'))$$,
  'the sender unsends their message');
select pg_temp.as_user('b');
select is((select count(*)::int from jsonb_array_elements(public.get_messages(pg_temp.convo('a', 'b'))) e
           where e ->> 'content' = 'yay!'), 0, 'it is gone for the other person');
select is((select last_message from public.get_inbox('active') where id = pg_temp.convo('a', 'b')), 'hey a',
  'and from the inbox preview');
reset role;
select is((select content from public.messages where unsent_at is not null), '',
  'its words are not kept');

-- 9. Staff removal holds: a removed message can't be edited or unsent back into view.
create temp table removed_msg as select id from public.messages where content = 'hey a';
grant select on removed_msg to authenticated;
update public.messages set removed_at = now(), removed_reason = 'test' where content = 'hey a';
select pg_temp.as_user('b');
select throws_ok($$select public.edit_message((select id from removed_msg), 'back')$$,
  '22023', null, 'a removed message cannot be edited');
select throws_ok($$select public.unsend_message((select id from removed_msg))$$,
  '22023', null, 'or unsent');

select * from finish();
rollback;
