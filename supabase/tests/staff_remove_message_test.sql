-- Staff remove a message (20261006150000_staff_remove_message): staff only, audit row, the
-- message is gone for both people (conversation, inbox, direct reads), and it can be restored.
-- a sends to b; c is a stranger; s is a moderator.
begin;
select plan(14);

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000e1' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email)
select pg_temp.uid(c), 'rm-' || c || '@example.invalid' from unnest(array['a','b','c','s']) c;
insert into public.profiles (id, username)
select pg_temp.uid(c), 'rm_test_' || c from unnest(array['a','b','c','s']) c;
insert into public.conversations (id, participant_one, participant_two, status, initiated_by) values
  ('00000000-0000-0000-0000-0000000e1e01', pg_temp.uid('a'), pg_temp.uid('b'), 'active', pg_temp.uid('a'));
insert into public.messages (id, conversation_id, sender_id, content, created_at) values
  ('00000000-0000-0000-0000-0000000e1e11', '00000000-0000-0000-0000-0000000e1e01', pg_temp.uid('a'), 'first', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000e1e12', '00000000-0000-0000-0000-0000000e1e01', pg_temp.uid('a'), 'nasty', now() - interval '1 minute');
insert into public.staff_users (user_id, role) values (pg_temp.uid('s'), 'moderator');

select pg_temp.as_user('b');
select is((public.report_message('00000000-0000-0000-0000-0000000e1e12', 'harassment') ->> 'already_reported')::boolean,
  false, 'b reports the message');

select pg_temp.as_user('c');
select throws_ok($$select public.staff_remove_message('00000000-0000-0000-0000-0000000e1e12', 'no')$$,
  '42501', 'staff only', 'only staff remove a message');

select pg_temp.as_user('s');
select throws_ok($$select public.staff_remove_message('00000000-0000-0000-0000-0000000e1e12', ' ')$$,
  '22023', 'a reason is needed', 'a reason is needed');
select throws_ok($$select public.staff_remove_message('00000000-0000-0000-0000-0000000e1e99', 'x')$$,
  '22023', 'that message does not exist', 'not a message that does not exist');
select is((public.staff_remove_message('00000000-0000-0000-0000-0000000e1e12', 'Bullying') ->> 'reports_closed')::int,
  1, 'removing it closes the open report');
select is((select count(*)::int from public.moderation_actions
           where action = 'remove_message' and target_id = '00000000-0000-0000-0000-0000000e1e12'
             and staff_id = pg_temp.uid('s') and reason = 'Bullying'),
  1, 'and it is in the audit log');
select is(public.staff_get_report((select id from public.user_reports
           where target_id = '00000000-0000-0000-0000-0000000e1e12')) -> 'target' ->> 'removed_reason',
  'Bullying', 'staff see it was removed, and why');

select pg_temp.as_user('a');
select is((select jsonb_agg(x ->> 'content') from jsonb_array_elements(
             public.get_messages('00000000-0000-0000-0000-0000000e1e01')) x),
  '["first"]'::jsonb, 'the sender no longer sees it in the conversation');
select is((select last_message from public.get_inbox('active')
           where id = '00000000-0000-0000-0000-0000000e1e01'),
  'first', 'nor as the last message in the inbox');
select is((select count(*)::int from public.messages where id = '00000000-0000-0000-0000-0000000e1e12'),
  0, 'nor reading the table directly');

select pg_temp.as_user('b');
select is((select jsonb_array_length(public.get_messages('00000000-0000-0000-0000-0000000e1e01'))),
  1, 'the other person no longer sees it either');
select is((select unread_count from public.get_inbox('active')
           where id = '00000000-0000-0000-0000-0000000e1e01'),
  1, 'and it does not count as unread');

select pg_temp.as_user('s');
select is((public.staff_restore_message('00000000-0000-0000-0000-0000000e1e12', 'Mistake') ->> 'ok')::boolean,
  true, 'staff can restore it');
select pg_temp.as_user('b');
select is((select jsonb_array_length(public.get_messages('00000000-0000-0000-0000-0000000e1e01'))),
  2, 'and it shows again');

select * from finish();
rollback;
