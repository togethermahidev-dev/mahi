-- Reactive posting: you post when someone tags you (your first post is free and earns 1). Each post that
-- answers a tag adds 1 to your streak, however many tags it answers. Missing a tag puts the streak
-- back to 0.
begin;
select plan(42);

-- Slots don't need filling here: this test is about answering, not tagging.
update public.app_config set tags_required = false, quiet_start = '00:00', quiet_end = '00:00';

-- A posts. B, C and D tag A (their tags are written directly, as create_post would).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000057aa', 'streak-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000057bb', 'streak-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000057cc', 'streak-c@example.invalid'),
  ('00000000-0000-0000-0000-0000000057dd', 'streak-d@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000057aa', 'streak_a', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000057bb', 'streak_b', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000057cc', 'streak_c', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000057dd', 'streak_d', 'Europe/London');
insert into storage.objects (bucket_id, name)
select 'posts', '00000000-0000-0000-0000-0000000057aa/' || n || '.jpg' from generate_series(1, 8) n
union all select 'posts', '00000000-0000-0000-0000-0000000057bb/1.jpg';

create function pg_temp.post(n int) returns jsonb language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000057aa","role":"authenticated"}', true);
  return public.create_post(('55555555-0000-0000-0000-00000000000' || n)::uuid,
    '00000000-0000-0000-0000-0000000057aa/' || n || '.jpg', null, null, '{}'::uuid[]);
end;
$$;
create function pg_temp.tag(p_from text, p_created interval default '0', p_expires interval default '48 hours')
returns void language sql as $$
  insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at)
  values (('00000000-0000-0000-0000-0000000057' || p_from || p_from)::uuid,
          '00000000-0000-0000-0000-0000000057aa', now() - p_created, now() - p_created + p_expires);
$$;
create function pg_temp.a() returns public.profiles language sql as $$
  select * from public.profiles where id = '00000000-0000-0000-0000-0000000057aa'
$$;

-- 1. The first post is always allowed and earns your first point (20261007180000_first_post_point).
select is(public.reactive_posting_open('00000000-0000-0000-0000-0000000057aa'), true,
  'reactive posting: someone who has never posted may post');
select is(pg_temp.post(1) -> 'streak',
  '{"streak_current": 1, "streak_highest": 1}'::jsonb,
  'a first post with nobody to answer is allowed and earns 1; the streak has only current and highest');
reset role;
select is((select streak_day from public.posts where client_id = '55555555-0000-0000-0000-000000000001'), 1,
  'the first post records point 1');

-- 2. After that you post only when tagged.
select is(public.reactive_posting_open('00000000-0000-0000-0000-0000000057aa'), false,
  'reactive posting: after the first post, no open tag means no posting');
select throws_ok($$select pg_temp.post(2)$$, 'P0001', 'reactive posting: not tagged',
  'a second post with no tag to answer is refused');
reset role;

-- 3. B tags A; A answers.
select pg_temp.tag('b');
select is(public.reactive_posting_open('00000000-0000-0000-0000-0000000057aa'), true,
  'reactive posting: an open tag opens posting');
select is(pg_temp.post(2) -> 'streak',
  '{"streak_current": 2, "streak_highest": 2}'::jsonb, 'answering a tag adds 1');
reset role;
select is((pg_temp.a()).streak_current, 2, 'the profile streak is 2');
select is((pg_temp.a()).streak_highest, 2, 'the highest streak follows it up');
select is((select streak_day from public.posts where client_id = '55555555-0000-0000-0000-000000000002'), 2,
  'the post records the streak after it');

-- 4. Tagged again the same local day: A can post again.
select pg_temp.tag('b');
select is((pg_temp.post(3) -> 'streak' ->> 'streak_current')::int, 3,
  'a second tag the same day lets you post again and adds 1');
reset role;
select is((select count(*)::int from public.posts
           where user_id = '00000000-0000-0000-0000-0000000057aa'
             and post_date = (now() at time zone 'Europe/London')::date), 3,
  'three posts on one local day');

-- 5. Three tags answered by one post still add only 1.
select pg_temp.tag('b');
select pg_temp.tag('c');
select pg_temp.tag('d');
select is((pg_temp.post(4) -> 'streak' ->> 'streak_current')::int, 4, 'one post answering three tags adds 1');
reset role;
select is((select count(*)::int from public.tag_challenges c
           join public.posts p on p.id = c.answered_post_id
           where p.client_id = '55555555-0000-0000-0000-000000000004'), 3, 'and answers all three');
select is((pg_temp.a()).streak_highest, 4, 'highest is 4');

-- 6. A misses B's tag: the streak goes back to 0, the highest stays, both are told.
select pg_temp.tag('b', '49 hours');
select is((pg_temp.a()).streak_current, 4, 'the streak stands until the miss is processed');
select is(public.reactive_posting_open('00000000-0000-0000-0000-0000000057aa'), false,
  'reactive posting: a tag past its deadline can''t be answered');
select public.mark_missed_tags();
select is((pg_temp.a()).streak_current, 0, 'a missed tag puts the streak back to 0');
select is((pg_temp.a()).streak_highest, 4, 'the highest streak is kept');
select is((select count(*)::int from public.notifications
           where type = 'streak_lost' and user_id = '00000000-0000-0000-0000-0000000057aa'
             and actor_id = '00000000-0000-0000-0000-0000000057bb'), 1,
  'the person who missed is told they lost their streak, from the tagger');
select is((select count(*)::int from public.notifications
           where type = 'tag_missed' and user_id = '00000000-0000-0000-0000-0000000057bb'
             and actor_id = '00000000-0000-0000-0000-0000000057aa'), 1,
  'the tagger is told their tag was missed');
select is((select count(*)::int from public.notifications
           where type = 'tag_missed' and user_id = '00000000-0000-0000-0000-0000000057aa'), 0,
  'the person who missed gets no tag_missed');
select is((select body from public.push_outbox
           where kind = 'streak_lost' and user_id = '00000000-0000-0000-0000-0000000057aa'),
  'You missed @streak_b''s tag. Your points are back to 0.', 'the push says the points are back to 0');
select ok((select missed_at is not null from public.tag_challenges
           where tagger_id = '00000000-0000-0000-0000-0000000057bb'
             and tagged_id = '00000000-0000-0000-0000-0000000057aa'
             and answered_at is null and cancelled_at is null),
  'the tag is marked missed');

-- Running the job again changes nothing.
update public.profiles set streak_current = 2 where id = '00000000-0000-0000-0000-0000000057aa';
select public.mark_missed_tags();
select is((pg_temp.a()).streak_current, 2, 'a tag breaks a streak only once');
select is((select count(*)::int from public.notifications
           where type = 'streak_lost' and user_id = '00000000-0000-0000-0000-0000000057aa'), 1,
  'and is announced once');

-- 7. C's tag has run out but the job hasn't run; D's is open. A answers D first.
update public.profiles set streak_current = 4, streak_highest = 4 where id = '00000000-0000-0000-0000-0000000057aa';
select pg_temp.tag('c', '49 hours');
select pg_temp.tag('d');
select is((pg_temp.post(5) -> 'streak' ->> 'streak_current')::int, 1,
  'a miss not yet processed still resets the streak before the answer counts');
reset role;
select is((pg_temp.a()).streak_highest, 4, 'highest kept at 4');
select ok((select missed_at is not null from public.tag_challenges
           where tagger_id = '00000000-0000-0000-0000-0000000057cc'
             and tagged_id = '00000000-0000-0000-0000-0000000057aa' and answered_at is null),
  'posting marks the run-out tag missed itself, without waiting for the job');
select public.mark_missed_tags();
select is((pg_temp.a()).streak_current, 1, 'the job later doesn''t reset the streak a second time');
select is((select count(*)::int from public.notifications
           where type = 'streak_lost' and user_id = '00000000-0000-0000-0000-0000000057aa'), 2,
  'the miss is still announced');

-- 8. A cancelled tag that runs out is not a miss.
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at, cancelled_at)
values ('00000000-0000-0000-0000-0000000057bb', '00000000-0000-0000-0000-0000000057aa',
        now() - interval '49 hours', now() - interval '1 hour', now() - interval '2 hours');
select public.mark_missed_tags();
select is((pg_temp.a()).streak_current, 1, 'a cancelled tag never breaks the streak');

-- 9. Old misses don't count against new streaks: a tag the job had already marked missed before
--    the streak rule began (missed_at set) never resets anything.
insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at, missed_at)
values ('00000000-0000-0000-0000-0000000057dd', '00000000-0000-0000-0000-0000000057aa',
        now() - interval '9 days', now() - interval '7 days', now() - interval '6 days');
select public.break_missed_streaks('00000000-0000-0000-0000-0000000057aa');
select is((pg_temp.a()).streak_current, 1, 'a tag already marked missed is never counted again');

-- 10. Anyone posting sweeps every run-out tag: B's tag on A ran out, and B's own (first) post
--     marks it missed and puts A's streak back to 0, not just B's own tags.
update public.profiles set streak_current = 3 where id = '00000000-0000-0000-0000-0000000057aa';
select pg_temp.tag('b', '49 hours');
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000057bb","role":"authenticated"}', true);
select is((public.create_post('55555555-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000057bb/1.jpg', null, null, '{}'::uuid[]) -> 'streak' ->> 'streak_current')::int,
  1, 'B''s first post is free and earns B''s first point');
reset role;
select is((pg_temp.a()).streak_current, 0, 'B posting puts A''s streak back to 0 for the tag A missed');
select is((select count(*)::int from public.tag_challenges
           where tagger_id = '00000000-0000-0000-0000-0000000057bb'
             and tagged_id = '00000000-0000-0000-0000-0000000057aa'
             and answered_at is null and cancelled_at is null and missed_at is null), 0,
  'and marks that tag missed, so B can tag A again');

-- 11. The old daily streak is gone, and the streak job isn't callable from the app.
select hasnt_function('public', 'record_upload_streak', 'record_upload_streak no longer exists');
select ok(not has_function_privilege('authenticated', 'public.reactive_posting_open(uuid)', 'execute'),
  'the app cannot call reactive_posting_open');
select ok(not has_function_privilege('authenticated', 'public.break_missed_streaks(uuid)', 'execute'),
  'the app cannot call break_missed_streaks');
select ok(not has_function_privilege('anon', 'public.break_missed_streaks(uuid)', 'execute'),
  'nor can signed-out callers');
select hasnt_column('public', 'tag_challenges', 'streak_broken_at', 'missed_at is the one missed timestamp');
select hasnt_index('public', 'tag_challenges', 'tag_challenges_streak_unbroken', 'and has no index of its own');

-- The rest-day columns and streak_logs are dropped by 20261001170000_drop_rest_days
-- (test: supabase/tests/drop_rest_days_test.sql).

select * from finish();
rollback;
