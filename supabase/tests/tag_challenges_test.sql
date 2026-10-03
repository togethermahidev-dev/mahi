-- Tag challenges: one atomic post, 3 tags, 48-hour deadlines, answering, missing, cancelling.
begin;
select plan(29);

-- Invite links off unless a section turns them on: fewer friends excuses the difference.
update public.app_config set invite_links_enabled = false;

-- A, B, C, D follow each other with A. E follows A but A doesn't follow back.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c00a', 'tag-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000c00b', 'tag-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000c00c', 'tag-c@example.invalid'),
  ('00000000-0000-0000-0000-00000000c00d', 'tag-d@example.invalid'),
  ('00000000-0000-0000-0000-00000000c00e', 'tag-e@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-00000000c00a', 'tag_a', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000c00b', 'tag_b', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000c00c', 'tag_c', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000c00d', 'tag_d', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000c00e', 'tag_e', 'Europe/London');
insert into public.follows (follower_id, following_id)
select a, b from (values
  ('00000000-0000-0000-0000-00000000c00a'::uuid, '00000000-0000-0000-0000-00000000c00b'::uuid),
  ('00000000-0000-0000-0000-00000000c00b', '00000000-0000-0000-0000-00000000c00a'),
  ('00000000-0000-0000-0000-00000000c00a', '00000000-0000-0000-0000-00000000c00c'),
  ('00000000-0000-0000-0000-00000000c00c', '00000000-0000-0000-0000-00000000c00a'),
  ('00000000-0000-0000-0000-00000000c00a', '00000000-0000-0000-0000-00000000c00d'),
  ('00000000-0000-0000-0000-00000000c00d', '00000000-0000-0000-0000-00000000c00a'),
  ('00000000-0000-0000-0000-00000000c00e', '00000000-0000-0000-0000-00000000c00a')
) v(a, b);
insert into storage.objects (bucket_id, name) values
  ('posts', '00000000-0000-0000-0000-00000000c00a/a1.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000c00a/a1_pov.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000c00a/a2.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000c00b/b1.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000c00c/c1.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000c00e/e1.jpg');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.challenge(p_tagger text, p_tagged text) returns public.tag_challenges language sql as $$
  select c.* from public.tag_challenges c
  join public.profiles t on t.id = c.tagger_id and t.username = p_tagger
  join public.profiles d on d.id = c.tagged_id and d.username = p_tagged;
$$;

-- 1. A posts and tags B, C, D in one call.
select pg_temp.as_user('00000000-0000-0000-0000-00000000c00a');
select is(
  (select count(*)::int from public.get_taggable_friends('', 50)), 3,
  'A can tag the 3 people who follow back (not E)'
);
select throws_ok(
  $$select public.create_post('11111111-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000c00a/a1.jpg', null, null,
    array['00000000-0000-0000-0000-00000000c00b','00000000-0000-0000-0000-00000000c00c']::uuid[])$$,
  '22023', null, 'fewer than 3 tags is refused when 3 friends are available'
);
select throws_ok(
  $$select public.create_post('11111111-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000c00a/a1.jpg', null, null,
    array['00000000-0000-0000-0000-00000000c00b','00000000-0000-0000-0000-00000000c00c','00000000-0000-0000-0000-00000000c00e']::uuid[])$$,
  '22023', null, 'tagging someone who does not follow back is refused'
);
select throws_ok(
  $$select public.create_post('11111111-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000c00b/b1.jpg', null, null,
    array['00000000-0000-0000-0000-00000000c00b','00000000-0000-0000-0000-00000000c00c','00000000-0000-0000-0000-00000000c00d']::uuid[])$$,
  '22023', null, 'someone else''s photo is refused'
);
select lives_ok(
  $$select public.create_post('11111111-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000c00a/a1.jpg', '00000000-0000-0000-0000-00000000c00a/a1_pov.jpg', ' Leg day ',
    array['00000000-0000-0000-0000-00000000c00b','00000000-0000-0000-0000-00000000c00c','00000000-0000-0000-0000-00000000c00d']::uuid[])$$,
  'A posts with 3 tags'
);
select is(
  (public.create_post('11111111-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000c00a/a1.jpg', null, null, '{}') ->> 'replayed')::boolean,
  true, 'retrying with the same client id returns the same post'
);
select throws_ok(
  $$select public.create_post('11111111-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-00000000c00a/a2.jpg', null, null,
    array['00000000-0000-0000-0000-00000000c00b','00000000-0000-0000-0000-00000000c00c','00000000-0000-0000-0000-00000000c00d']::uuid[])$$,
  'P0001', 'reactive posting: not tagged', 'a second post with no tag to answer is refused'
);
reset role;

select is((select count(*)::int from public.posts where user_id = '00000000-0000-0000-0000-00000000c00a'), 1, 'one post saved');
select is((select caption from public.posts where user_id = '00000000-0000-0000-0000-00000000c00a'), 'Leg day', 'caption trimmed');
select is((select streak_day from public.posts where user_id = '00000000-0000-0000-0000-00000000c00a'), 0,
  'streak recorded in the same call: a first post answers nobody, so 0');
select is((select count(*)::int from public.tag_challenges where tagger_id = '00000000-0000-0000-0000-00000000c00a'), 3, '3 challenges');
select ok((pg_temp.challenge('tag_a', 'tag_b')).expires_at = now() + interval '48 hours', 'deadline is 48 hours out');
select is((select count(*)::int from public.post_tags pt join public.posts p on p.id = pt.post_id
           where p.user_id = '00000000-0000-0000-0000-00000000c00a'), 3, 'tag bubbles saved');
select is((select count(*)::int from public.push_outbox
           where kind = 'tag' and body = 'You''ve just been tagged by @tag_a. 48 hours left to post your Mahi!'), 3,
  'each friend gets one tag push with the deadline');
-- At least 3: a "2 hours left" reminder that quiet hours would push past the deadline is dropped.
select ok((select count(*) from public.push_outbox
           where kind = 'tag_reminder' and body like '% hours left to post your Mahi! @tag_a is waiting.') >= 3,
  'reminders are queued');

-- 2. B answers A's tag (3 hours later). B's only friend is A, who can't be tagged back,
--    so no tags are needed.
update public.tag_challenges set created_at = now() - interval '3 hours', started_at = now() - interval '3 hours'
where id = (pg_temp.challenge('tag_a', 'tag_b')).id;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c00b');
select is((select count(*)::int from public.get_open_tags()), 1, 'B sees one open tag');
select lives_ok(
  $$select public.create_post('11111111-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-00000000c00b/b1.jpg', null, null, '{}')$$,
  'B posts with no tags: the only friend is the one who tagged them'
);
select is((select count(*)::int from public.get_open_tags()), 0, 'B has no open tags left');
select throws_ok($$insert into public.tag_challenges (tagger_id, tagged_id, expires_at)
  values ('00000000-0000-0000-0000-00000000c00b', '00000000-0000-0000-0000-00000000c00a', now())$$,
  '42501', null, 'clients cannot write challenges');
reset role;

select ok((pg_temp.challenge('tag_a', 'tag_b')).answered_at is not null, 'A''s tag on B is answered');
select is((select count(*)::int from public.push_outbox
           where challenge_id = (pg_temp.challenge('tag_a', 'tag_b')).id and sent_at is null and kind = 'tag_reminder'), 0,
  'answering removes the unsent reminders');
select is((select body from public.push_outbox
           where kind = 'tag_answered' and user_id = '00000000-0000-0000-0000-00000000c00a'),
  '@tag_b answered your tag in 3h', 'A is told how fast B answered');
select is((public.answered_by_post((pg_temp.challenge('tag_a', 'tag_b')).answered_post_id) -> 0 ->> 'seconds')::int,
  10800, 'the post records the response time');

-- 3. C can't tag back A, whose tag C's post would answer.
select pg_temp.as_user('00000000-0000-0000-0000-00000000c00c');
select throws_ok(
  $$select public.create_post('11111111-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-00000000c00c/c1.jpg', null, null,
    array['00000000-0000-0000-0000-00000000c00a']::uuid[])$$,
  '22023', null, 'you cannot tag back someone whose tag you are answering'
);
reset role;

-- 4. D blocks A: A's open tag on D is cancelled with its pushes.
insert into public.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-00000000c00d', '00000000-0000-0000-0000-00000000c00a');
select ok((pg_temp.challenge('tag_a', 'tag_d')).cancelled_at is not null, 'blocking cancels the open tag');
select is((select count(*)::int from public.push_outbox
           where challenge_id = (pg_temp.challenge('tag_a', 'tag_d')).id and sent_at is null), 0,
  'cancelling removes the unsent pushes');

-- 5. A's tag on C runs out: both are told, and a late post doesn't count.
update public.tag_challenges set expires_at = now() - interval '1 hour'
where id = (pg_temp.challenge('tag_a', 'tag_c')).id;
select public.mark_missed_tags();
select is((select count(*)::int from public.notifications
           where type = 'tag_missed' and user_id = '00000000-0000-0000-0000-00000000c00a'), 1,
  'the tagger is told about the miss');
select is((select count(*)::int from public.notifications
           where type = 'streak_lost' and user_id = '00000000-0000-0000-0000-00000000c00c'), 1,
  'the tagged person is told they lost their streak');
select is((select body from public.push_outbox where kind = 'tag_missed' and user_id = '00000000-0000-0000-0000-00000000c00a'),
  '@tag_c missed your tag', 'the tagger''s push names who missed');

select * from finish();
rollback;
