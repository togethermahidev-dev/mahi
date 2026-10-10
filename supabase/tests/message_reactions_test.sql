-- Message reactions (owner, 2026-10-07: "hold-down to react with emojis on message conversations
-- per message, like PingMee-v2"). One reaction per person per message: the same emoji again takes
-- it off, a different one replaces it. Only the two people in the chat can react or see reactions,
-- and the same closed doors as sending apply: a waiting request, a block, a ban, a gone message.
begin;
select plan(32);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b200a', 'rx-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000b200b', 'rx-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000b200c', 'rx-c@example.invalid'),
  ('00000000-0000-0000-0000-0000000b200d', 'rx-d@example.invalid'),
  ('00000000-0000-0000-0000-0000000b200e', 'rx-e@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000b200a', 'rx_a'),
  ('00000000-0000-0000-0000-0000000b200b', 'rx_b'),
  ('00000000-0000-0000-0000-0000000b200c', 'rx_c'),
  ('00000000-0000-0000-0000-0000000b200d', 'rx_d'),
  ('00000000-0000-0000-0000-0000000b200e', 'rx_e');
-- A and B are friends, and so are A and E; C and D know nobody.
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-0000000b200a', '00000000-0000-0000-0000-0000000b200b'),
  ('00000000-0000-0000-0000-0000000b200b', '00000000-0000-0000-0000-0000000b200a'),
  ('00000000-0000-0000-0000-0000000b200a', '00000000-0000-0000-0000-0000000b200e'),
  ('00000000-0000-0000-0000-0000000b200e', '00000000-0000-0000-0000-0000000b200a');

create function pg_temp.as_user(p_who text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', '00000000-0000-0000-0000-0000000b200' || p_who, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.uid(p_who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000b200' || p_who)::uuid
$$;
create function pg_temp.convo(p_x text, p_y text) returns uuid language sql as $$
  select id from public.conversations
  where participant_one = least(pg_temp.uid(p_x), pg_temp.uid(p_y))
    and participant_two = greatest(pg_temp.uid(p_x), pg_temp.uid(p_y))
$$;
create function pg_temp.msg(p_x text, p_y text, p_content text) returns uuid language sql as $$
  select id from public.messages where conversation_id = pg_temp.convo(p_x, p_y) and content = p_content
$$;

-- Friends: the first message opens the chat straight away.
select pg_temp.as_user('a');
select lives_ok($$select public.start_conversation(pg_temp.uid('b'), '44444444-0000-0000-0000-000000000001', 'hi b')$$,
  'A opens a chat with B');

-- 1. React, see it counted as yours.
select is(public.react_to_message(pg_temp.msg('a', 'b', 'hi b'), '👍'),
  '[{"emoji": "👍", "count": 1, "mine": true}]'::jsonb,
  'A reacts and sees one thumbs up, theirs');
select pg_temp.as_user('b');
select is(public.react_to_message(pg_temp.msg('a', 'b', 'hi b'), '👍'),
  '[{"emoji": "👍", "count": 2, "mine": true}]'::jsonb,
  'B adds theirs: two, and it counts as B''s');
select pg_temp.as_user('a');
select is(public.get_message_reactions(pg_temp.msg('a', 'b', 'hi b')),
  '[{"emoji": "👍", "count": 2, "mine": true}]'::jsonb,
  'A reads the same two');

-- 2. The same emoji again takes it off; a different one replaces it.
select is(public.react_to_message(pg_temp.msg('a', 'b', 'hi b'), '👍'),
  '[{"emoji": "👍", "count": 1, "mine": false}]'::jsonb,
  'thumbs up again takes A''s off, B''s stays');
select is(public.react_to_message(pg_temp.msg('a', 'b', 'hi b'), '❤️'),
  '[{"emoji": "👍", "count": 1, "mine": false}, {"emoji": "❤️", "count": 1, "mine": true}]'::jsonb,
  'a heart is added after B''s earlier thumbs up');
select is(public.react_to_message(pg_temp.msg('a', 'b', 'hi b'), '🔥'),
  '[{"emoji": "👍", "count": 1, "mine": false}, {"emoji": "🔥", "count": 1, "mine": true}]'::jsonb,
  'fire replaces the heart');
reset role;
select is((select count(*)::int from public.message_reactions
           where message_id = pg_temp.msg('a', 'b', 'hi b') and user_id = pg_temp.uid('a')), 1,
  'one row per person per message');

-- 3. Messages come with their reactions; nothing else about them changes.
select pg_temp.as_user('b');
select is(public.get_messages(pg_temp.convo('a', 'b')) -> 0 -> 'reactions',
  '[{"emoji": "👍", "count": 1, "mine": true}, {"emoji": "🔥", "count": 1, "mine": false}]'::jsonb,
  'get_messages carries each message''s reactions, mine from the reader''s side');
select is(public.get_messages(pg_temp.convo('a', 'b')) -> 0 ->> 'content', 'hi b',
  'the message''s own fields are as before');
-- 10 since 20261010100000_share_post_in_message: every message also carries post_id (null here).
select is((select count(*)::int from jsonb_object_keys(public.get_messages(pg_temp.convo('a', 'b')) -> 0)), 10,
  'the fields are the message''s own, reactions and post_id; a text message has no post');
select is(public.send_message(pg_temp.convo('a', 'b'), gen_random_uuid(), 'fresh') -> 'reactions', null,
  'send_message''s row is unchanged (no reactions field)');

-- 4. Only the two people in the chat. (Outsiders cannot even look the message up, so its id is
-- taken as the server and handed to them.)
reset role;
create temp table held_hi as select pg_temp.msg('a', 'b', 'hi b') as id;
grant select on held_hi to public;
select pg_temp.as_user('c');
select throws_ok($$select public.react_to_message((select id from held_hi), '👍')$$,
  '42501', 'not your conversation', 'an outsider cannot react');
select throws_ok($$select public.get_message_reactions((select id from held_hi))$$,
  '42501', 'not your conversation', 'nor read reactions through the function');
select is((select count(*)::int from public.message_reactions), 0,
  'nor see any row directly');
select pg_temp.as_user('a');
select is((select count(*)::int from public.message_reactions where message_id = pg_temp.msg('a', 'b', 'hi b')), 2,
  'a participant can read the rows directly (realtime)');
select throws_ok($$insert into public.message_reactions (message_id, conversation_id, user_id, emoji)
  values (pg_temp.msg('a', 'b', 'hi b'), pg_temp.convo('a', 'b'), pg_temp.uid('a'), '😂')$$,
  '42501', null, 'nobody writes a reaction row directly');
select throws_ok($$delete from public.message_reactions where user_id = pg_temp.uid('a')$$,
  '42501', null, 'nor deletes one directly');
reset role;
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.react_to_message((select id from held_hi), '👍')$$,
  '42501', null, 'signed out cannot react (not callable by anon since 20261008150000)');
reset role;

-- 5. One emoji, not a sentence.
select pg_temp.as_user('a');
select throws_ok($$select public.react_to_message(pg_temp.msg('a', 'b', 'hi b'), 'great work mate')$$,
  '22023', 'pick one emoji', 'a reaction is one emoji');
select throws_ok($$select public.react_to_message(pg_temp.msg('a', 'b', 'hi b'), '')$$,
  '22023', 'pick one emoji', 'and not nothing');

-- 6. A waiting request takes no reactions, from either side; after accepting it does.
select lives_ok($$select public.start_conversation(pg_temp.uid('d'), '44444444-0000-0000-0000-000000000002', 'hey d')$$,
  'A sends D a request');
select throws_ok($$select public.react_to_message(pg_temp.msg('a', 'd', 'hey d'), '👍')$$,
  '42501', 'waiting for them to accept', 'the sender cannot react while it waits');
select pg_temp.as_user('d');
select throws_ok($$select public.react_to_message(pg_temp.msg('a', 'd', 'hey d'), '👍')$$,
  '42501', 'accept the request first', 'the receiver accepts before reacting');
select lives_ok($$select public.accept_message_request(pg_temp.convo('a', 'd'))$$, 'D accepts');
select is(public.react_to_message(pg_temp.msg('a', 'd', 'hey d'), '💪') -> 0 ->> 'emoji', '💪',
  'then D can react');

-- 7. A block closes the chat for reactions too; a gone message takes none.
select pg_temp.as_user('a');
select lives_ok($$select public.start_conversation(pg_temp.uid('e'), '44444444-0000-0000-0000-000000000003', 'hi e')$$,
  'A opens a chat with E');
reset role;
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('e'), pg_temp.uid('a'));
select pg_temp.as_user('a');
select throws_ok($$select public.react_to_message(pg_temp.msg('a', 'e', 'hi e'), '👍')$$,
  '42501', 'this conversation is closed', 'blocked: no reactions');
create temp table fresh as select pg_temp.msg('a', 'b', 'fresh') as id;
select pg_temp.as_user('b');
select lives_ok($$select public.unsend_message((select id from fresh))$$, 'B unsends their message');
select pg_temp.as_user('a');
select throws_ok($$select public.react_to_message((select id from fresh), '👍')$$,
  'P0002', 'message gone', 'an unsent message takes no reactions');

-- 8. Reactions go with their message, and the table is live for the app.
reset role;
create temp table held as select pg_temp.msg('a', 'b', 'hi b') as id;
delete from public.messages where id = (select id from held);
select is((select count(*)::int from public.message_reactions r where r.message_id = (select id from held)), 0,
  'its reactions are gone with it');
select is((select count(*)::int from pg_publication_tables
           where pubname = 'supabase_realtime' and tablename = 'message_reactions'), 1,
  'message_reactions is in the realtime publication');

select * from finish();
rollback;
