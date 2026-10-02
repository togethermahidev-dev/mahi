-- The numbers of record: a known week of tag-loop activity, counted by the stats views.
begin;
select plan(19);

-- Invite links off unless a section turns them on: fewer friends excuses the difference.
update public.app_config set invite_links_enabled = false;

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
-- The invite A's post makes below — never somebody else's, on a database with real invites in it.
create function pg_temp.open_code() returns text language sql security definer as $$
  select code from public.invites
  where claimed_at is null and inviter_id = '00000000-0000-0000-0000-00000000e00a'
  order by created_at, token limit 1;
$$;
-- These views group real rows by day and by week, so on a database with history in it they
-- return many rows. Everything below reads this day and this week, and counts the change the
-- test itself makes — which is the same number on an empty database and on a live one.
create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'Europe/London')::date;
$$;
create function pg_temp.this_week() returns date language sql as $$
  select date_trunc('week', pg_temp.today()::timestamp)::date;
$$;
create function pg_temp.posts_today() returns stats.posts_daily language sql as $$
  select * from stats.posts_daily where day = pg_temp.today();
$$;
create function pg_temp.week_now() returns stats.users_weekly language sql as $$
  select * from stats.users_weekly where week = pg_temp.this_week();
$$;
-- Tags and invites are grouped by the UTC day they were made.
create function pg_temp.utc_today() returns date language sql as $$
  select (now() at time zone 'UTC')::date;
$$;
create function pg_temp.tags_today() returns stats.tags_daily language sql as $$
  select * from stats.tags_daily where day = pg_temp.utc_today();
$$;
create function pg_temp.invites_today() returns stats.invites_daily language sql as $$
  select * from stats.invites_daily where day = pg_temp.utc_today();
$$;
create table pg_temp.base as
select coalesce((pg_temp.posts_today()).posts, 0) as posts,
       coalesce((pg_temp.posts_today()).answering_a_tag, 0) as answering,
       coalesce((pg_temp.week_now()).posted, 0) as posted,
       coalesce((pg_temp.tags_today()).sent, 0) as tags_sent,
       coalesce((pg_temp.tags_today()).waiting_on_invite, 0) as tags_waiting,
       coalesce((pg_temp.tags_today()).still_open, 0) as tags_open,
       coalesce((pg_temp.tags_today()).answered, 0) as tags_answered,
       coalesce((pg_temp.invites_today()).sent, 0) as invites_sent,
       coalesce((pg_temp.invites_today()).claimed, 0) as invites_claimed;

-- A posts, tagging B and C and inviting one more.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e00a');
select public.create_post('33333333-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000e00a/a1.jpg', null, null,
  array['00000000-0000-0000-0000-00000000e00b',
        '00000000-0000-0000-0000-00000000e00c']::uuid[], null, null, 1);
reset role;

-- 1. Nothing has come back yet.
select is((pg_temp.tags_today()).sent - (select tags_sent from pg_temp.base), 3,
  'three tags went out, the invite included');
select is((pg_temp.tags_today()).waiting_on_invite - (select tags_waiting from pg_temp.base), 1,
  'one is waiting on an invite');
select is((pg_temp.tags_today()).still_open - (select tags_open from pg_temp.base), 2,
  'two are open with someone to answer');
select is((pg_temp.tags_today()).answered - (select tags_answered from pg_temp.base), 0,
  'none answered yet');
select is(
  (pg_temp.tags_today()).answered_pct,
  round(100.0 * (pg_temp.tags_today()).answered
        / ((pg_temp.tags_today()).sent - (pg_temp.tags_today()).waiting_on_invite), 1),
  'the answer rate counts only real tags, not the one waiting on an invite'
);
select is((pg_temp.invites_today()).sent - (select invites_sent from pg_temp.base), 1,
  'one invite link went out');
select is((pg_temp.invites_today()).claimed - (select invites_claimed from pg_temp.base), 0,
  'nobody has claimed it');

-- 2. A's own post answers nobody, so the posting rate is 0.
select is((pg_temp.posts_today()).posts - (select posts from pg_temp.base), 1,
  'one post so far');
select is((pg_temp.posts_today()).answering_a_tag - (select answering from pg_temp.base), 0,
  'it answered nobody');

-- 3. B answers. B's only friend is A, who tagged B, so B's post tags nobody.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e00b');
select public.create_post('33333333-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-00000000e00b/b1.jpg', null, null, '{}'::uuid[]);
reset role;
select is((pg_temp.tags_today()).answered - (select tags_answered from pg_temp.base), 1,
  'one tag came back');
select is(
  (pg_temp.tags_today()).answered_pct,
  round(100.0 * (pg_temp.tags_today()).answered
        / ((pg_temp.tags_today()).sent - (pg_temp.tags_today()).waiting_on_invite), 1),
  'the answer rate is that day''s answered tags over its tags with someone in them'
);
select ok((pg_temp.tags_today()).median_answer_seconds >= 0,
  'the median answer time is counted');
select is((pg_temp.posts_today()).answering_a_tag - (select answering from pg_temp.base), 1,
  'one post answered a tag');
select is(
  (pg_temp.posts_today()).answering_pct,
  round(100.0 * (pg_temp.posts_today()).answering_a_tag / (pg_temp.posts_today()).posts, 1),
  'the share that answered a tag is that day''s own two numbers'
);
select hasnt_view('stats', 'points_daily',
  'no points view: Mahi points live on profiles (20261002170000_mahi_points)');

-- 4. N joins from the link.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e00d');
select public.claim_invite(pg_temp.open_code());
reset role;
select is((pg_temp.invites_today()).claimed - (select invites_claimed from pg_temp.base), 1,
  'the invite turned into an account');
select is((pg_temp.tags_today()).waiting_on_invite - (select tags_waiting from pg_temp.base), 0,
  'its tag now has someone in it');

-- 5. Weekly posting: 4 accounts exist, 2 of them posted.
select is((pg_temp.week_now()).posted - (select posted from pg_temp.base), 2,
  'two people posted this week who had not before');
select is(
  (pg_temp.week_now()).posted_pct,
  round(100.0 * (pg_temp.week_now()).posted / (pg_temp.week_now()).accounts, 1),
  'the share who posted is that week''s own two numbers'
);

select * from finish();
rollback;
