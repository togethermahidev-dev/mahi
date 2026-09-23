-- Server-truth numbers (tag-loop plan, Phase 8).
-- The figures of record for the beta, read straight off the tables that enforce the rules —
-- not off analytics events, which a phone can lose, duplicate or send twice from two devices.
--
-- They live in their own `stats` schema so PostgREST never exposes them: nobody reads these
-- through the app, only the owner through the SQL editor. Dates are each user's own posting day
-- where one exists (`posts.post_date`, `point_events.local_date`) and UTC otherwise.
-- Test: supabase/tests/stats_test.sql

create schema stats;
revoke all on schema stats from anon, authenticated;

-- Tags by the day they were sent: how many came back, how many ran out, how fast people answered.
-- "Answered" already means inside the 48 hours — a later post cannot answer a tag.
create view stats.tags_daily as
select
  (c.created_at at time zone 'UTC')::date as day,
  count(*)::int as sent,
  count(*) filter (where c.tagged_id is null and c.cancelled_at is null)::int as waiting_on_invite,
  count(*) filter (where c.answered_at is not null)::int as answered,
  count(*) filter (where c.missed_at is not null)::int as missed,
  count(*) filter (
    where c.answered_at is null and c.missed_at is null
      and c.cancelled_at is null and c.tagged_id is not null
  )::int as still_open,
  count(*) filter (where c.cancelled_at is not null)::int as cancelled,
  round(
    100.0 * count(*) filter (where c.answered_at is not null)
    / nullif(count(*) filter (where c.tagged_id is not null), 0), 1
  ) as answered_pct,
  round(percentile_cont(0.5) within group (
    order by extract(epoch from c.answered_at - c.created_at)
  ) filter (where c.answered_at is not null))::int as median_answer_seconds
from public.tag_challenges c
group by 1;

-- Posts by the poster's own day, and how many of them answered somebody's tag.
create view stats.posts_daily as
select
  p.post_date as day,
  count(*)::int as posts,
  count(distinct p.user_id)::int as posters,
  count(*) filter (
    where exists (select 1 from public.tag_challenges c where c.answered_post_id = p.id)
  )::int as answering_a_tag,
  round(
    100.0 * count(*) filter (
      where exists (select 1 from public.tag_challenges c where c.answered_post_id = p.id)
    ) / nullif(count(*), 0), 1
  ) as answering_pct
from public.posts p
group by 1;

-- Invite links by the day they were sent, and how many turned into an account.
create view stats.invites_daily as
select
  (i.created_at at time zone 'UTC')::date as day,
  count(*)::int as sent,
  count(*) filter (where i.claimed_at is not null)::int as claimed,
  count(*) filter (where i.claimed_at is null and i.expires_at < now())::int as expired,
  round(
    100.0 * count(*) filter (where i.claimed_at is not null) / nullif(count(*), 0), 1
  ) as claimed_pct
from public.invites i
group by 1;

-- Points by the earner's own day, split between answering a tag and having sent one.
create view stats.points_daily as
select
  e.local_date as day,
  count(*)::int as points,
  count(distinct e.user_id)::int as earners,
  count(*) filter (where e.role = 'answerer')::int as to_answerers,
  count(*) filter (where e.role = 'tagger')::int as to_taggers
from public.point_events e
group by 1;

-- Weeks with any posting in them: how many accounts existed by the end of the week, and how
-- many of them posted. Weeks start Monday, following date_trunc.
create view stats.users_weekly as
select
  w.week,
  s.accounts,
  s.posted,
  round(100.0 * s.posted / nullif(s.accounts, 0), 1) as posted_pct
from (select distinct date_trunc('week', post_date::timestamp)::date as week from public.posts) w
cross join lateral (
  select
    (select count(*)::int from public.profiles pr
     where not pr.is_banned and pr.created_at < (w.week + 7)::timestamp) as accounts,
    (select count(distinct p.user_id)::int from public.posts p
     where p.post_date >= w.week and p.post_date < w.week + 7) as posted
) s;

revoke all on all tables in schema stats from anon, authenticated;
