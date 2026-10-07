-- The invite funnel of record, by week: links made, links for a mate, joined, joined and then
-- posted (20261007200000_invites_weekly). PostHog reads it as posthog_reader; the app can't.
begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f1a01', 'iw-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000f1a02', 'iw-n@example.invalid'),
  ('00000000-0000-0000-0000-0000000f1a03', 'iw-m@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000f1a01', 'iw_a', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000f1a02', 'iw_n', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000f1a03', 'iw_m', 'Europe/London');

-- A's tag slot behind one link.
insert into public.tag_challenges (id, tagger_id, created_at)
values ('00000000-0000-0000-0000-0000000f1c01', '00000000-0000-0000-0000-0000000f1a01', '2020-01-06 09:00Z');

-- Week of Monday 6 January 2020: three links. N joins from a mate link and posts; M joins from
-- the tag link and doesn't post; the third mate link is never used.
insert into public.invites (token, code, inviter_id, challenge_id, created_at, expires_at, claimed_by, claimed_at) values
  ('iwtoken000000000000000000000001', 'IWAAA2', '00000000-0000-0000-0000-0000000f1a01', null,
   '2020-01-06 10:00Z', '2020-01-13 10:00Z', '00000000-0000-0000-0000-0000000f1a02', '2020-01-06 12:00Z'),
  ('iwtoken000000000000000000000002', 'IWAAA3', '00000000-0000-0000-0000-0000000f1a01', '00000000-0000-0000-0000-0000000f1c01',
   '2020-01-07 10:00Z', '2020-01-14 10:00Z', '00000000-0000-0000-0000-0000000f1a03', '2020-01-07 12:00Z'),
  ('iwtoken000000000000000000000003', 'IWAAA4', '00000000-0000-0000-0000-0000000f1a01', null,
   '2020-01-08 10:00Z', '2020-01-15 10:00Z', null, null);
insert into public.posts (id, user_id, image_url, streak_day, post_date)
values ('00000000-0000-0000-0000-0000000f1b01', '00000000-0000-0000-0000-0000000f1a02', 'x', 1, current_date);

create function pg_temp.wk() returns stats.invites_weekly language sql as $$
  select * from stats.invites_weekly where week = '2020-01-06'
$$;

select is((pg_temp.wk()).made, 3, 'three links made that week');
select is((pg_temp.wk()).mate_links, 2, 'two of them were links for a mate (no tag behind them)');
select is((pg_temp.wk()).joined, 2, 'two people joined from them');
select is((pg_temp.wk()).joined_and_posted, 1, 'one of those went on to post');
select is((pg_temp.wk()).joined_pct, 66.7, 'two in three links became a sign-up');

select ok(has_table_privilege('posthog_reader', 'stats.invites_weekly', 'select'),
  'PostHog''s read-only login can read it');
select ok(not has_table_privilege('authenticated', 'stats.invites_weekly', 'select'),
  'the app cannot');
select ok(not has_table_privilege('anon', 'stats.invites_weekly', 'select'),
  'nor can anyone signed out');

select * from finish();
rollback;
