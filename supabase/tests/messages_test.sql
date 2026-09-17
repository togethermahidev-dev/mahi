-- Messages: one send path, no duplicates, paging, unread counts, pushes, and blocks that hold.
begin;
select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a100a', 'msg-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000a100b', 'msg-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000a100c', 'msg-c@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000a100a', 'msg_a'),
  ('00000000-0000-0000-0000-0000000a100b', 'msg_b'),
  ('00000000-0000-0000-0000-0000000a100c', 'msg_c');

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', '00000000-0000-0000-0000-0000000a100' || p_who, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.convo() returns uuid language sql as $$
  select id from public.conversations
  where participant_one = '00000000-0000-0000-0000-0000000a100a'
    and participant_two = '00000000-0000-0000-0000-0000000a100b'
$$;

-- A opens a request to B (the app's existing path).
select pg_temp.as_user('a');
insert into public.conversations (participant_one, participant_two, initiated_by)
values ('00000000-0000-0000-0000-0000000a100a', '00000000-0000-0000-0000-0000000a100b',
        '00000000-0000-0000-0000-0000000a100a');

-- 1. Sending.
select lives_ok($$select public.send_message(pg_temp.convo(), '22222222-0000-0000-0000-000000000001', 'hey')$$,
  'the requester can send the first message');
select lives_ok($$select public.send_message(pg_temp.convo(), '22222222-0000-0000-0000-000000000001', 'hey')$$,
  'a retry with the same client id is accepted');
select public.send_message(pg_temp.convo(), '22222222-0000-0000-0000-000000000002', 'you in?');
select public.send_message(pg_temp.convo(), '22222222-0000-0000-0000-000000000003', 'gym at 6');
select is((select count(*)::int from public.messages where conversation_id = pg_temp.convo()), 3,
  'the retry did not make a second message');
select throws_ok($$select public.send_message(pg_temp.convo(), gen_random_uuid(), '   ')$$, '22023', null,
  'empty messages are refused');
select throws_ok($$select public.send_message(pg_temp.convo(), gen_random_uuid(), repeat('x', 2001))$$, '22023', null,
  'messages over 2000 characters are refused');

-- 2. Accepting: only the person who received the request.
select throws_ok($$update public.conversations set status = 'active' where id = pg_temp.convo()$$, '42501', null,
  'the requester cannot accept their own request');
select pg_temp.as_user('b');
select is((select unread_count from public.get_inbox('requested') where id = pg_temp.convo()), 3,
  'B sees 3 unread messages in the request');
select lives_ok($$update public.conversations set status = 'active' where id = pg_temp.convo()$$,
  'the receiver can accept');
reset role;
select is((select status from public.conversations where id = pg_temp.convo()), 'active', 'the request is now active');

-- 3. Paging and reading.
select pg_temp.as_user('b');
select is(jsonb_array_length(public.get_messages(pg_temp.convo(), null, null, 2)), 2, 'a page holds the limit');
select is(
  jsonb_array_length(public.get_messages(pg_temp.convo(),
    (public.get_messages(pg_temp.convo(), null, null, 2) -> 1 ->> 'created_at')::timestamptz,
    (public.get_messages(pg_temp.convo(), null, null, 2) -> 1 ->> 'id')::uuid, 2)),
  1, 'the next page holds the rest');
select public.mark_conversation_read(pg_temp.convo());
select is((select unread_count from public.get_inbox('active') where id = pg_temp.convo()), 0,
  'reading clears the unread count');
select is((select other_username from public.get_inbox('active') where id = pg_temp.convo()), 'msg_a',
  'the inbox names the other person');

-- 4. Outsiders.
select pg_temp.as_user('c');
select throws_ok($$select public.send_message(pg_temp.convo(), gen_random_uuid(), 'hi')$$, '42501', null,
  'someone outside the conversation cannot send');
select throws_ok($$select public.get_messages(pg_temp.convo(), null, null, 10)$$, '42501', null,
  'or read');

-- 5. Pushes: one per sender per conversation per minute.
reset role;
select is((select count(*)::int from public.push_outbox
           where user_id = '00000000-0000-0000-0000-0000000a100b' and kind = 'message'), 1,
  'three quick messages make one push');
select is((select data ->> 'conversation_id' from public.push_outbox
           where user_id = '00000000-0000-0000-0000-0000000a100b' and kind = 'message'),
  pg_temp.convo()::text, 'the push opens the conversation');

-- 6. Blocking works and holds.
select lives_ok($$insert into public.user_blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-0000000a100b', '00000000-0000-0000-0000-0000000a100a')$$,
  'blocking someone you have messaged works');
select pg_temp.as_user('a');
select throws_ok($$select public.send_message(pg_temp.convo(), gen_random_uuid(), 'why')$$, '42501', null,
  'a blocked person cannot send');
select throws_ok($$insert into public.messages (conversation_id, sender_id, content)
  values (pg_temp.convo(), '00000000-0000-0000-0000-0000000a100a', 'sneaky')$$, '42501', null,
  'not even with a direct insert');
reset role;
delete from public.user_blocks where blocker_id = '00000000-0000-0000-0000-0000000a100b';
select is((select status from public.conversations where id = pg_temp.convo()), 'active',
  'unblocking restores the conversation');

select * from finish();
rollback;
