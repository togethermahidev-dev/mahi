-- Moderation (20261006100000_moderation): reports, the staff list and actions, the audit log,
-- hidden posts and removed comments, warnings / suspensions / bans, and the AI check's queue.
-- a posts; b comments and reports; c is a stranger; s is a moderator, x an admin.
-- Every check reads only this test's own people, so it also runs on a database with history.
begin;
select plan(62);

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000d0' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('role', 'service_role', true),
         set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
$$;

insert into auth.users (id, email)
select pg_temp.uid(c), 'mod-' || c || '@example.invalid' from unnest(array['a','b','c','s','x']) c;
insert into public.profiles (id, username)
select pg_temp.uid(c), 'mod_test_' || c from unnest(array['a','b','c','s','x']) c;
insert into public.follows (follower_id, following_id) values
  (pg_temp.uid('b'), pg_temp.uid('a')), (pg_temp.uid('a'), pg_temp.uid('b'));
insert into public.posts (id, user_id, image_url, image_path, streak_day) values
  ('00000000-0000-0000-0000-0000000d0f01', pg_temp.uid('a'), 'x', pg_temp.uid('a') || '/m1.jpg', 0),
  ('00000000-0000-0000-0000-0000000d0f02', pg_temp.uid('a'), 'x', pg_temp.uid('a') || '/m2.jpg', 0);
update public.posts set caption = 'second post' where id = '00000000-0000-0000-0000-0000000d0f02';
insert into public.post_comments (id, post_id, user_id, content) values
  ('00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0f02', pg_temp.uid('a'), 'from a'),
  ('00000000-0000-0000-0000-0000000d0c02', '00000000-0000-0000-0000-0000000d0f02', pg_temp.uid('b'), 'from b');
insert into public.conversations (id, participant_one, participant_two, status, initiated_by) values
  ('00000000-0000-0000-0000-0000000d0e01', pg_temp.uid('a'), pg_temp.uid('b'), 'active', pg_temp.uid('a'));
insert into public.messages (id, conversation_id, sender_id, content) values
  ('00000000-0000-0000-0000-0000000d0e11', '00000000-0000-0000-0000-0000000d0e01', pg_temp.uid('a'), 'hello');
-- Staff need a confirmed email (20261008110000_staff_confirmed_email).
update auth.users set email_confirmed_at = now() where id in (pg_temp.uid('s'), pg_temp.uid('x'));
insert into public.staff_users (user_id, role) values
  (pg_temp.uid('s'), 'moderator'), (pg_temp.uid('x'), 'admin');

select has_table('public', 'staff_users', 'staff are listed in their own table');
select has_table('public', 'user_sanctions', 'warnings, suspensions and bans are kept');
select has_table('public', 'moderation_actions', 'every staff action is logged');
select has_table('public', 'moderation_scans', 'the AI check has a queue');

-- 1. Reporting, only through the report calls (the old direct insert closed in
--    20261008140000_security_hardening_live).
select pg_temp.as_user('b');
select throws_ok($$insert into public.user_reports (reporter_id, reported_user_id, reason)
                   values (pg_temp.uid('b'), pg_temp.uid('a'), 'spam')$$,
  '42501', null, 'a direct report is refused');
select is((public.report_user(pg_temp.uid('a'), 'spam') ->> 'already_reported')::boolean, false,
  'report_user files a report');
select is((public.report_user(pg_temp.uid('a'), 'spam') ->> 'already_reported')::boolean, true,
  'and a repeat is "already reported"');
select is((public.report_post('00000000-0000-0000-0000-0000000d0f01', 'sexual_content', 'not ok')
           ->> 'already_reported')::boolean, false, 'report_post files a report');
select is((public.report_post('00000000-0000-0000-0000-0000000d0f01', 'spam')
           ->> 'already_reported')::boolean, true, 'reporting the same post again is not a second report');
select throws_ok($$select public.report_post('00000000-0000-0000-0000-0000000d0f01', 'boring')$$,
  '22023', 'unknown reason', 'only known reasons');
select throws_ok($$select public.report_post('00000000-0000-0000-0000-0000000d0f01', 'spam', repeat('x', 501))$$,
  '22023', null, 'details are at most 500 characters');
select is((public.report_comment('00000000-0000-0000-0000-0000000d0c01', 'harassment')
           ->> 'already_reported')::boolean, false, 'report_comment files a report');
select is((public.report_message('00000000-0000-0000-0000-0000000d0e11', 'harassment')
           ->> 'already_reported')::boolean, false, 'report_message files a report');
select throws_ok($$select public.report_comment('00000000-0000-0000-0000-0000000d0c02', 'spam')$$,
  '22023', 'you cannot report yourself', 'not your own comment');
select throws_ok($$select public.report_post('00000000-0000-0000-0000-0000000d0f99', 'spam')$$,
  '22023', 'that does not exist', 'not something that does not exist');
select throws_ok($$insert into public.user_reports (reporter_id, reported_post_id, reason, status)
                   values (pg_temp.uid('b'), '00000000-0000-0000-0000-0000000d0f02', 'spam', 'actioned')$$,
  '42501', null, 'the app cannot set a report''s status');
select is((select count(*)::int from public.user_reports), 4, 'b sees their own four reports');
-- The copy is staff-only since 20261008130000_security_followups, so read it as the server.
reset role;
select is(
  (select row(target_type, target_owner_id, snapshot ->> 'content', status, source)::text
   from public.user_reports where target_id = '00000000-0000-0000-0000-0000000d0c01'),
  row('comment', pg_temp.uid('a'), 'from a', 'open', 'user')::text,
  'a comment report knows whose it is and keeps what it said');
select pg_temp.as_user('b');
select throws_ok($$select public.staff_get_queue()$$, '42501', 'staff only', 'b is not staff');
select is(public.my_staff_role(), null, 'and has no staff role');
reset role;

select pg_temp.as_user('c');
select throws_ok($$select public.report_message('00000000-0000-0000-0000-0000000d0e11', 'spam')$$,
  '22023', 'that does not exist', 'only someone in the conversation can report a message');
select is((select count(*)::int from public.user_reports where target_owner_id = pg_temp.uid('a')), 0,
  'c cannot read b''s reports');
select is((select count(*)::int from public.moderation_actions), 0, 'nor the audit log');
reset role;

-- 2. The staff list.
select pg_temp.as_user('s');
select is(public.my_staff_role(), 'moderator', 's is a moderator');
select is(
  (select count(*)::int from jsonb_array_elements(public.staff_get_queue('open', null, 200)) e
   where e -> 'owner' ->> 'id' = pg_temp.uid('a')::text), 4, 'the list has the four open reports on a');
select is(
  (select array_agg(e -> 'target' ->> 'content') from jsonb_array_elements(public.staff_get_queue('open', 'comment', 200)) e
   where e -> 'owner' ->> 'id' = pg_temp.uid('a')::text), array['from a'],
  'filtered to comments, with what the comment says');
select is(
  (select (e ->> 'open_reports_on_target')::int
   from jsonb_array_elements(public.staff_get_queue('open', 'post', 200)) e
   where e ->> 'target_id' = '00000000-0000-0000-0000-0000000d0f01'), 1,
  'each item says how many open reports its target has');
select is((select status from public.user_reports where target_id = pg_temp.uid('a') and reporter_id = pg_temp.uid('b')),
  'open', 'staff can read every report');
select is(
  (public.staff_review_report((select id from public.user_reports
                               where target_id = '00000000-0000-0000-0000-0000000d0f01')) ->> 'status'),
  'reviewing', 'a report can be taken for review');

-- 3. Hiding a post.
select is((public.staff_hide_post('00000000-0000-0000-0000-0000000d0f01', 'Nudity') ->> 'reports_closed')::int, 1,
  'hiding the post closes its report');
select is((select status from public.user_reports where target_id = '00000000-0000-0000-0000-0000000d0f01'),
  'actioned', 'as actioned');
select is((select count(*)::int from public.posts where id = '00000000-0000-0000-0000-0000000d0f01'), 1,
  'staff still see a hidden post');
select throws_ok($$select public.staff_hide_post('00000000-0000-0000-0000-0000000d0f02', ' ')$$,
  '22023', 'a reason is needed', 'every action needs a reason');
reset role;

select pg_temp.as_user('b');
select is((select count(*)::int from public.posts where id = '00000000-0000-0000-0000-0000000d0f01'), 0,
  'others cannot read a hidden post');
select is(
  (select array_agg(i ->> 'id' order by i ->> 'id') from jsonb_array_elements(public.get_feed(50) -> 'items') i
   where i ->> 'user_id' = pg_temp.uid('a')::text),
  array['00000000-0000-0000-0000-0000000d0f02'], 'the feed leaves the hidden post out');
reset role;
select pg_temp.as_user('a');
select is(
  (select array_agg(i ->> 'id') from jsonb_array_elements(public.get_user_posts(pg_temp.uid('a')) -> 'items') i),
  array['00000000-0000-0000-0000-0000000d0f02'], 'so does the profile, even for its owner');
select throws_ok($$update public.posts set hidden_at = now() where id = '00000000-0000-0000-0000-0000000d0f02'$$,
  '42501', null, 'an owner cannot touch the hidden columns');
reset role;

-- 4. Removing a comment.
select pg_temp.as_user('s');
select is((public.staff_remove_comment('00000000-0000-0000-0000-0000000d0c01', 'Bullying') ->> 'ok')::boolean, true,
  'staff remove a comment');
reset role;
select pg_temp.as_user('b');
select is((select array_agg(content) from public.post_comments where post_id = '00000000-0000-0000-0000-0000000d0f02'),
  array['from b'], 'a removed comment is gone for everyone else');
reset role;
select is((public.feed_item((select p from public.posts p where p.id = '00000000-0000-0000-0000-0000000d0f02'),
                            pg_temp.uid('b'), false) ->> 'comment_count')::int, 1,
  'and from the comment count');

-- 5. Warn, suspend, ban, unban.
select pg_temp.as_user('s');
select throws_ok($$select public.staff_ban_user(pg_temp.uid('a'), 'Spam account')$$, '42501', 'admins only',
  'a moderator cannot ban');
select throws_ok($$select public.staff_suspend_user(pg_temp.uid('x'), 'no', 1)$$, '22023', null,
  'staff cannot be suspended from the portal');
select is((public.staff_warn_user(pg_temp.uid('b'), 'Keep it friendly') ->> 'ok')::boolean, true, 'staff warn b');
select is((public.staff_suspend_user(pg_temp.uid('a'), 'Repeated nudity', 3) ->> 'reports_closed')::int, 1,
  'staff suspend a, closing the report on a');
reset role;
select is((select is_banned from public.profiles where id = pg_temp.uid('a')), true, 'a suspension bans for now');

select pg_temp.as_user('a');
select is((select row(public.get_my_standing() ->> 'status', public.get_my_standing() ->> 'reason')::text),
  row('suspended', 'Repeated nudity')::text, 'a sees they are suspended and why');
select throws_ok($$insert into public.post_comments (post_id, user_id, content)
                   values ('00000000-0000-0000-0000-0000000d0f02', pg_temp.uid('a'), 'hi')$$,
  '42501', null, 'and cannot comment');
reset role;

select pg_temp.as_user('b');
select is(jsonb_array_length(public.get_my_standing() -> 'warnings'), 1, 'b sees the warning');
select lives_ok($$select public.mark_warnings_seen()$$, 'and marks it seen');
select is(jsonb_array_length(public.get_my_standing() -> 'warnings'), 0, 'once');
reset role;

update public.user_sanctions set ends_at = now() - interval '1 minute'
where user_id = pg_temp.uid('a') and kind = 'suspension';
select public.lift_ended_suspensions();
select is((select is_banned from public.profiles where id = pg_temp.uid('a')), false,
  'a suspension ends on its own');

select pg_temp.as_user('x');
select lives_ok($$select public.staff_ban_user(pg_temp.uid('a'), 'Spam account')$$, 'an admin bans');
select is((select is_banned from public.profiles where id = pg_temp.uid('a')), true, 'a is banned');
select lives_ok($$select public.staff_unban_user(pg_temp.uid('a'), 'Appeal accepted')$$, 'and unbans');
select is((select is_banned from public.profiles where id = pg_temp.uid('a')), false, 'a is back');
select is(
  (public.staff_dismiss_report((select id from public.user_reports
                                where target_id = '00000000-0000-0000-0000-0000000d0e11')) ->> 'status'),
  'dismissed', 'a report can be dismissed');
select is(
  (select array_agg(action order by created_at, action) from public.moderation_actions
   where target_id in (pg_temp.uid('a'), pg_temp.uid('b'), '00000000-0000-0000-0000-0000000d0f01',
                       '00000000-0000-0000-0000-0000000d0c01')),
  array['ban_user', 'hide_post', 'remove_comment', 'suspend_user', 'unban_user', 'warn_user'],
  'every action is in the audit log');
reset role;

-- 6. The AI check: every new post and comment is queued; a flag goes on the staff list.
select is((select count(*)::int from public.moderation_scans
           where target_id in ('00000000-0000-0000-0000-0000000d0f02', '00000000-0000-0000-0000-0000000d0c02')
             and status = 'pending'), 2, 'new posts and comments wait for the AI check');
select pg_temp.as_service();
select is(
  (select b.body from public.claim_moderation_batch(100) b where b.target_id = '00000000-0000-0000-0000-0000000d0f02'),
  'second post', 'the function gets the caption (and the photos) to check');
select lives_ok(
  $$select public.complete_moderation_scan(
      (select id from public.moderation_scans where target_id = '00000000-0000-0000-0000-0000000d0c02'),
      'done', 'flag', array['harassment'], '{"harassment": 0.8}'::jsonb, 'openai', null, 'harassment')$$,
  'the function records a flag');
reset role;
select is(
  (select row(source, reason, status, reporter_id is null)::text from public.user_reports
   where target_id = '00000000-0000-0000-0000-0000000d0c02'),
  row('ai', 'harassment', 'open', true)::text, 'a flag is an AI report on the staff list');
select is((select removed_at is null from public.post_comments where id = '00000000-0000-0000-0000-0000000d0c02'),
  true, 'with automatic hiding off, nothing is removed');

select * from finish();
rollback;
