-- The numbers of record: a known week of tag-loop activity, counted by the stats views.
begin;
select plan(19);

update public.app_config set quiet_start = '00:00', quiet_end = '00:00';

-- Four people who all follow each other with A, plus N who joins from an invite.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e00a', 'st-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000e00b', 'st-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000e00c', 'st-c@example.invalid'),
  ('00000000-0000-0000-0000-00000000e00d', 'st-n@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-00000000e00a', 'st_a', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000e00b', 'st_b', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000e00c', 'st_c', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000e00d', 'st_n', 'Europe/London');
insert into public.follows (follower_id, following_id)
select a, b from (values
  ('00000000-0000-0000-0000-00000000e00a'::uuid, '00000000-0000-0000-0000-00000000e00b'::uuid),
  ('00000000-0000-0000-0000-00000000e00b', '00000000-0000-0000-0000-00000000e00a'),
  ('00000000-0000-0000-0000-00000000e00a', '00000000-0000-0000-0000-00000000e00c'),
  ('00000000-0000-0000-0000-00000000e00c', '00000000-0000-0000-0000-00000000e00a')
) v(a, b);
insert into storage.objects (bucket_id, name) values
  ('posts', '00000000-0000-0000-0000-00000000e00a/a1.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000e00b/b1.jpg');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.open_code() returns text language sql security definer as $$
  select code from public.invites where claimed_at is null order by created_at, token limit 1;
$$;

-- A posts, tagging B and C and inviting one more.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e00a');
select public.create_post('33333333-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000e00a/a1.jpg', null, null,
  array['00000000-0000-0000-0000-00000000e00b',
        '00000000-0000-0000-0000-00000000e00c']::uuid[], null, null, 1);
reset role;

-- 1. Nothing has come back yet.
select is((select sent from stats.tags_daily), 3, 'three tags went out, the invite included');
select is((select waiting_on_invite from stats.tags_daily), 1, 'one is waiting on an invite');
select is((select still_open from stats.tags_daily), 2, 'two are open with someone to answer');
select is((select answered from stats.tags_daily), 0, 'none answered yet');
select is((select answered_pct from stats.tags_daily), 0.0, 'the answer rate counts only real tags');
select is((select sent from stats.invites_daily), 1, 'one invite link went out');
select is((select claimed_pct from stats.invites_daily), 0.0, 'nobody has claimed it');

-- 2. A's own post answers nobody, so the posting rate is 0.
select is((select posts from stats.posts_daily), 1, 'one post so far');
select is((select answering_a_tag from stats.posts_daily), 0, 'it answered nobody');

-- 3. B answers — and B's own post tags A, so a third real tag exists from here on.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e00b');
select public.create_post('33333333-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-00000000e00b/b1.jpg', null, null,
  array['00000000-0000-0000-0000-00000000e00a']::uuid[]);
reset role;
select is((select answered from stats.tags_daily), 1, 'one tag came back');
select is((select answered_pct from stats.tags_daily), 33.3,
  'one of the three tags with someone in them was answered');
select ok((select median_answer_seconds from stats.tags_daily) >= 0,
  'the median answer time is counted');
select is((select answering_a_tag from stats.posts_daily), 1, 'one post answered a tag');
select is((select answering_pct from stats.posts_daily), 50.0, 'half of the posts answered a tag');
select is((select points from stats.points_daily), 2, 'the answerer and the tagger each earned one');
select is((select to_taggers from stats.points_daily), 1, 'one of those went to the tagger');

-- 4. N joins from the link.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e00d');
select public.claim_invite(pg_temp.open_code());
reset role;
select is((select claimed_pct from stats.invites_daily), 100.0, 'the invite turned into an account');
select is((select waiting_on_invite from stats.tags_daily), 0, 'its tag now has someone in it');

-- 5. Weekly posting: 4 accounts exist, 2 of them posted.
select is((select posted_pct from stats.users_weekly), 50.0, 'half the accounts posted this week');

select * from finish();
rollback;
