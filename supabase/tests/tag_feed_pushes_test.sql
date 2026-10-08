-- Tag and feed-lock pushes (20261002190000_tag_and_feed_pushes): what each push says, when the
-- two feed-lock pushes are queued, and what takes them back.
-- Every check reads only this test's own people (pg_temp.uid), so it also runs on a database
-- with history.
begin;
select plan(52);

select has_column('public', 'app_config', 'feed_lock_warning_push', 'the warning push has its own switch');
select has_column('public', 'app_config', 'feed_lock_warning_lead', 'and its own lead time');
select has_column('public', 'app_config', 'feed_locked_push', 'the locked push has its own switch');
select col_default_is('public', 'app_config', 'feed_lock_warning_push', 'true', 'the warning starts switched on');
select col_default_is('public', 'app_config', 'feed_lock_warning_lead', '1 hour', 'one hour ahead');
select col_default_is('public', 'app_config', 'feed_locked_push', 'true', 'the locked push starts switched on');
select throws_ok($$update public.app_config set feed_lock_warning_lead = '0 minutes'$$, '23514', null,
  'the lead time has to be longer than nothing');

-- The rules as the founder set them, no quiet hours and no invite links, so every time below is
-- exact. Sections that test a setting change it and put it back.
update public.app_config set
  quiet_start = '00:00', quiet_end = '00:00',
  tag_window = '48 hours', answer_grace = '10 minutes', unlock_window = '24 hours',
  feed_lock_enabled = true, tags_required = true, tag_count = 3, invite_links_enabled = false,
  feed_lock_warning_push = true, feed_lock_warning_lead = '1 hour', feed_locked_push = true;

-- A is friends (follows both ways) with B, C and D. E, F and G only show up later.
create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000fe0' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'fpush-' || c || '@example.invalid' from unnest(array['a','b','c','d','e','f','g']) c;
insert into public.profiles (id, username, timezone)
select pg_temp.uid(c), 'fpush_test_' || c, 'UTC' from unnest(array['a','b','c','d','e','f','g']) c;

-- p_who posts photo n, tagging p_tags.
create function pg_temp.post(p_who text, n int, p_tags text[] default '{}') returns jsonb
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.uid(p_who), 'role', 'authenticated')::text, true);
  return public.create_post(gen_random_uuid(),
    pg_temp.uid(p_who) || '/' || n || '.jpg', null, null,
    array(select pg_temp.uid(t) from unnest(p_tags) t));
end;
$$;
-- This person's queued (unsent) pushes of one kind.
create function pg_temp.queued(p text, p_kind text) returns setof public.push_outbox language sql as $$
  select * from public.push_outbox
  where user_id = pg_temp.uid(p) and kind = p_kind and sent_at is null
$$;
create function pg_temp.tag(p_tagger text, p_tagged text) returns public.tag_challenges language sql as $$
  select * from public.tag_challenges
  where tagger_id = pg_temp.uid(p_tagger) and tagged_id = pg_temp.uid(p_tagged)
  order by created_at desc limit 1
$$;

insert into public.follows (follower_id, following_id)
select pg_temp.uid(a), pg_temp.uid(b) from (values
  ('a', 'b'), ('b', 'a'), ('a', 'c'), ('c', 'a'), ('a', 'd'), ('d', 'a')) v(a, b);
insert into storage.objects (bucket_id, name) values
  ('posts', pg_temp.uid('a') || '/1.jpg'),
  ('posts', pg_temp.uid('c') || '/2.jpg');

-- Earlier posts, with chosen times (triggers off so created_at sticks): C posted 2 hours ago
-- (feed open for another 22), D 30 hours ago (the 24 hours are over), F 23 and a half hours ago.
set local session_replication_role = replica;
insert into public.posts (id, user_id, image_url, image_path, streak_day, created_at, post_date) values
  ('00000000-0000-0000-0000-00000fe0c001', pg_temp.uid('c'), 'x', pg_temp.uid('c') || '/c1.jpg', 0,
   now() - interval '2 hours', current_date),
  ('00000000-0000-0000-0000-00000fe0d001', pg_temp.uid('d'), 'x', pg_temp.uid('d') || '/d1.jpg', 0,
   now() - interval '30 hours', current_date),
  ('00000000-0000-0000-0000-00000fe0f001', pg_temp.uid('f'), 'x', pg_temp.uid('f') || '/f1.jpg', 0,
   now() - interval '23 hours 30 minutes', current_date);
set local session_replication_role = origin;

-- 1. A posts and tags B, C and D.
select lives_ok($$select pg_temp.post('a', 1, array['b', 'c', 'd'])$$, 'A posts with three tags');
reset role;

select is((select body from pg_temp.queued('b', 'tag')),
  '@fpush_test_a tagged you. Post any workout by {deadline}.',
  'the tag push says who tagged you and the deadline (filled in when sent)');
select is((select data ->> 'route' from pg_temp.queued('b', 'tag')), 'camera', 'and opens the camera');
select is(
  (select string_agg(body, ' | ' order by send_after) from pg_temp.queued('b', 'tag_reminder')),
  'Answer @fpush_test_a''s tag by {deadline}. | Last call: answer @fpush_test_a''s tag by {deadline}.',
  'the two reminders say whose tag and the deadline');
select is(
  (select array_agg(send_after order by send_after) from pg_temp.queued('b', 'tag_reminder')),
  array[now() + interval '24 hours', now() + interval '46 hours'],
  'and go out 24 hours and 2 hours before the deadline');
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('b') and kind in ('feed_lock_warning', 'feed_locked')), 0,
  'someone who has never posted has no open feed to lose: no feed pushes');

-- 2. C's feed is open (posted 2 hours ago) and A's tag will lock it when the 24 hours end.
select is((select body from pg_temp.queued('c', 'feed_lock_warning')),
  'Your feed locks in 1 hour. Post your answer to @fpush_test_a to keep it open.',
  'tagged with the feed open: a warning is queued');
select is((select send_after from pg_temp.queued('c', 'feed_lock_warning')), now() + interval '21 hours',
  'for one hour before the 24 hours end');
select is((select body from pg_temp.queued('c', 'feed_locked')),
  'Your feed is locked. Post your answer to @fpush_test_a to open it.',
  'and a locked push');
select is((select send_after from pg_temp.queued('c', 'feed_locked')), now() + interval '22 hours',
  'for the moment the feed locks');
select is(
  (select array_agg(distinct data ->> 'route') from public.push_outbox
   where user_id = pg_temp.uid('c') and kind in ('feed_lock_warning', 'feed_locked')),
  array['camera'], 'both open the camera');
select is(
  (select array_agg(distinct challenge_id) from public.push_outbox
   where user_id = pg_temp.uid('c') and kind in ('feed_lock_warning', 'feed_locked')),
  array[(pg_temp.tag('a', 'c')).id], 'and belong to the tag that will lock the feed');

-- D's 24 hours were already over: the tag locks the feed at once, and the tag push is the news.
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('d') and kind in ('feed_lock_warning', 'feed_locked')), 0,
  'tagged after the 24 hours: no feed pushes on top of the tag push');
select is((select count(*)::int from pg_temp.queued('d', 'tag_reminder')), 2, 'the reminders still go');

-- 3. C answers (3 hours after the tag): everything queued for that tag goes.
update public.tag_challenges set created_at = now() - interval '3 hours', started_at = now() - interval '3 hours'
  where id = (pg_temp.tag('a', 'c')).id;
select lives_ok($$select pg_temp.post('c', 2)$$, 'C posts their answer');
reset role;
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('c') and sent_at is null
             and kind in ('feed_lock_warning', 'feed_locked', 'tag_reminder')), 0,
  'posting takes back the feed pushes and the reminders');
select is((select body from pg_temp.queued('a', 'tag_answered')), '@fpush_test_c answered your tag in 3 hours',
  'the tagger hears how fast the answer came');

-- 4. Two friends tag C inside the new 24 hours. The pushes name the tag that runs out first.
--    (clock_timestamp: in one transaction now() is the same for the post and the tag, and a tag
--    only counts when it was made after the post.)
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at)
values (pg_temp.uid('a'), pg_temp.uid('c'), clock_timestamp(), now() + interval '48 hours');
select is((select send_after from pg_temp.queued('c', 'feed_lock_warning')), now() + interval '23 hours',
  'a new post restarts the 24 hours: the warning moves with it');
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at)
values (pg_temp.uid('e'), pg_temp.uid('c'), clock_timestamp(), now() + interval '40 hours');
select is(
  (select string_agg(body, ' | ' order by send_after) from public.push_outbox
   where user_id = pg_temp.uid('c') and sent_at is null and kind in ('feed_lock_warning', 'feed_locked')),
  'Your feed locks in 1 hour. Post your answer to @fpush_test_e to keep it open. | Your feed is locked. Post your answer to @fpush_test_e to open it.',
  'a second tag does not double the pushes; they name the tag with the nearest deadline');

-- E blocks C: that tag is cancelled, A's still locks the feed.
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('e'), pg_temp.uid('c'));
select is(
  (select string_agg(body, ' | ' order by send_after) from public.push_outbox
   where user_id = pg_temp.uid('c') and sent_at is null and kind in ('feed_lock_warning', 'feed_locked')),
  'Your feed locks in 1 hour. Post your answer to @fpush_test_a to keep it open. | Your feed is locked. Post your answer to @fpush_test_a to open it.',
  'when that tag is cancelled the pushes name the tag that is left');

-- 5. The owner's settings. C still holds A's tag, 24 hours of open feed ahead.
update public.app_config set feed_lock_warning_lead = '2 hours';
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is((select body from pg_temp.queued('c', 'feed_lock_warning')),
  'Your feed locks in 2 hours. Post your answer to @fpush_test_a to keep it open.',
  'the lead time is the owner''s to set: the words follow it');
select is((select send_after from pg_temp.queued('c', 'feed_lock_warning')), now() + interval '22 hours',
  'and so does the time');
update public.app_config set feed_lock_warning_lead = '90 minutes';
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is((select body from pg_temp.queued('c', 'feed_lock_warning')),
  'Your feed locks in 1 hour 30 minutes. Post your answer to @fpush_test_a to keep it open.',
  'hours and minutes are both said');
update public.app_config set feed_lock_warning_lead = '30 minutes';
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is((select body from pg_temp.queued('c', 'feed_lock_warning')),
  'Your feed locks in 30 minutes. Post your answer to @fpush_test_a to keep it open.',
  'or minutes alone');
update public.app_config set feed_lock_warning_lead = '1 hour', feed_lock_warning_push = false;
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is(
  (select array_agg(kind order by kind) from public.push_outbox
   where user_id = pg_temp.uid('c') and sent_at is null and kind in ('feed_lock_warning', 'feed_locked')),
  array['feed_locked'], 'the warning can be switched off by itself');
update public.app_config set feed_lock_warning_push = true, feed_locked_push = false;
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is(
  (select array_agg(kind order by kind) from public.push_outbox
   where user_id = pg_temp.uid('c') and sent_at is null and kind in ('feed_lock_warning', 'feed_locked')),
  array['feed_lock_warning'], 'and so can the locked push');
update public.app_config set feed_locked_push = true, feed_lock_enabled = false;
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('c') and sent_at is null and kind in ('feed_lock_warning', 'feed_locked')), 0,
  'with the feed lock itself off there is nothing to warn about');
update public.app_config set feed_lock_enabled = true;

-- 6. Quiet hours. A warning that would have to wait is dropped ("in 1 hour" would be untrue);
--    the locked push waits for the morning.
update public.app_config set
  quiet_start = ((now() + interval '23 hours' - interval '20 minutes') at time zone 'UTC')::time,
  quiet_end = ((now() + interval '23 hours' + interval '20 minutes') at time zone 'UTC')::time;
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is((select count(*)::int from pg_temp.queued('c', 'feed_lock_warning')), 0,
  'a warning that falls in quiet hours is not sent late');
select is((select send_after from pg_temp.queued('c', 'feed_locked')), now() + interval '24 hours',
  'the locked push outside quiet hours is untouched');
update public.app_config set
  quiet_start = ((now() + interval '24 hours' - interval '20 minutes') at time zone 'UTC')::time,
  quiet_end = ((now() + interval '24 hours' + interval '20 minutes') at time zone 'UTC')::time;
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is((select send_after from pg_temp.queued('c', 'feed_locked')),
  now() + interval '24 hours 20 minutes',
  'a locked push that falls in quiet hours waits until they end');
select is((select send_after from pg_temp.queued('c', 'feed_lock_warning')), now() + interval '23 hours',
  'and the warning before them goes as planned');
update public.app_config set quiet_start = '00:00', quiet_end = '00:00';

-- 7. A warning already sent is not sent again for the same 24 hours.
update public.push_outbox set sent_at = now()
where user_id = pg_temp.uid('c') and kind = 'feed_lock_warning';
select public.schedule_feed_lock_pushes(pg_temp.uid('c'));
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('c') and kind = 'feed_lock_warning'), 1,
  'a sent warning is not queued a second time');

-- The last tag is cancelled (A deletes the post that carried it... here, directly): nothing left.
update public.tag_challenges set cancelled_at = now() where id = (pg_temp.tag('a', 'c')).id;
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('c') and sent_at is null and kind in ('feed_lock_warning', 'feed_locked')), 0,
  'with no tag left the feed stays open: the locked push is taken back');

-- 8. F posted 23 and a half hours ago: too late for a one-hour warning, the locked push still goes.
insert into public.tag_challenges (tagger_id, tagged_id, expires_at)
values (pg_temp.uid('a'), pg_temp.uid('f'), now() + interval '48 hours');
select is((select count(*)::int from pg_temp.queued('f', 'feed_lock_warning')), 0,
  'no warning when less than the lead time is left');
select is((select send_after from pg_temp.queued('f', 'feed_locked')), now() + interval '30 minutes',
  'the locked push goes when the 24 hours end');

-- A missed tag still locks the feed, but there is nothing to post: no "post your answer" push.
update public.tag_challenges set expires_at = now() - interval '1 hour' where id = (pg_temp.tag('a', 'f')).id;
select public.break_missed_streaks(pg_temp.uid('f'));
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('f') and sent_at is null and kind in ('feed_lock_warning', 'feed_locked')), 0,
  'a missed tag takes its feed pushes with it');

-- 9. A shorter tag window: the tag push's deadline follows it, and a reminder whose moment has
--    already passed is not sent.
update public.app_config set tag_window = '12 hours';
insert into public.tag_challenges (tagger_id, tagged_id, expires_at)
values (pg_temp.uid('a'), pg_temp.uid('g'), now() + interval '12 hours');
insert into public.notifications (user_id, actor_id, type, challenge_id)
values (pg_temp.uid('g'), pg_temp.uid('a'), 'tag', (pg_temp.tag('a', 'g')).id);
select is((select body from pg_temp.queued('g', 'tag')),
  '@fpush_test_a tagged you. Post any workout by {deadline}.',
  'the tag push takes its deadline from the tag');
select is((select array_agg(body) from pg_temp.queued('g', 'tag_reminder')),
  array['Last call: answer @fpush_test_a''s tag by {deadline}.'],
  'with 12 hours to answer there is no "24 hours left" reminder');
update public.app_config set tag_window = '48 hours';

-- 10. The other pushes, word for word.
insert into public.notifications (user_id, actor_id, type) values
  (pg_temp.uid('g'), pg_temp.uid('a'), 'like'),
  (pg_temp.uid('g'), pg_temp.uid('a'), 'comment'),
  (pg_temp.uid('g'), pg_temp.uid('a'), 'follow'),
  (pg_temp.uid('g'), pg_temp.uid('a'), 'tag_missed'),
  (pg_temp.uid('g'), pg_temp.uid('a'), 'streak_lost'),
  (pg_temp.uid('g'), pg_temp.uid('a'), 'invite_joined');
select is(
  (select string_agg(kind || ': ' || body, ' | ' order by kind) from public.push_outbox
   where user_id = pg_temp.uid('g') and kind in ('like', 'comment', 'follow', 'tag_missed', 'streak_lost', 'invite_joined')),
  'comment: @fpush_test_a commented on your post | follow: @fpush_test_a started following you | '
  || 'invite_joined: @fpush_test_a joined Mahi from your invite. You follow each other now. | like: @fpush_test_a liked your post | '
  || 'streak_lost: You missed @fpush_test_a''s tag. Your points are back to 0. | tag_missed: @fpush_test_a missed your tag. Tag them in your next post to get them going again.',
  'likes, comments and follows keep their words; a join confirms the mutual follow; a miss says points, not streak, and gives the tagger a next step');
select is((select count(*)::int from public.push_outbox
           where user_id in (select pg_temp.uid(x) from unnest(array['a','b','c','d','e','f','g']) x)
             and (body ilike '%streak%' or body like '%hours left%' or body like '%tagged you. You have%' or body like '%!%')), 0,
  'no push says streak, uses the old tag wording or shouts');

-- 11. A banned person gets nothing.
update public.profiles set is_banned = true where id = pg_temp.uid('e');
set local session_replication_role = replica;
insert into public.posts (id, user_id, image_url, image_path, streak_day, created_at, post_date) values
  ('00000000-0000-0000-0000-00000fe0e001', pg_temp.uid('e'), 'x', pg_temp.uid('e') || '/e1.jpg', 0,
   now() - interval '2 hours', current_date);
set local session_replication_role = origin;
insert into public.tag_challenges (tagger_id, tagged_id, expires_at)
values (pg_temp.uid('a'), pg_temp.uid('e'), now() + interval '48 hours');
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('e') and sent_at is null), 0,
  'a banned person is queued no reminders and no feed pushes');

-- 12. Who may call what.
select is(has_function_privilege('authenticated', 'public.schedule_feed_lock_pushes(uuid)', 'execute'), false,
  'the app cannot schedule feed pushes');
select is(has_function_privilege('anon', 'public.schedule_feed_lock_pushes(uuid)', 'execute'), false,
  'nor can signed-out callers');
select is(has_function_privilege('authenticated', 'public.queue_tag_pushes()', 'execute'), false,
  'the app cannot call the tag trigger''s function');
select is(has_function_privilege('authenticated', 'public.format_time_left(interval)', 'execute'), false,
  'nor the wording helper');

select * from finish();
rollback;
