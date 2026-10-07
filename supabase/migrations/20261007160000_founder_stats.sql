-- Founder numbers of record: signups, active people, retention, activation and churn.
-- Read straight off the tables, like 20260923101500_stats_views, so they cannot be lost,
-- duplicated or sent twice from two phones the way app analytics events can. PostHog shows
-- how people move through the app; these are the counts to quote.
--
-- Definitions (all days and weeks in UTC; weeks start Monday):
--   person    — an account with a profile (staff logins have no profile and are left out).
--   active    — did at least one thing that day: posted, liked, commented, sent a message,
--               followed someone, answered a tag request, or joined from an invite. Opening the
--               app and looking is not counted here; PostHog counts that.
--   activated — posted within 7 days of signing up.
--
-- `posthog_reader` is a role with no login and no access to any app table: it can read these
-- totals only. The owner gives it a password when connecting PostHog (owner steps in the
-- analytics hand-over). Test: supabase/tests/founder_stats_test.sql

-- One row per person per day they did something. Building block only: the reader cannot see it.
create view stats.activity as
select distinct a.user_id, a.day
from (
  select user_id, (created_at at time zone 'UTC')::date as day from public.posts
  union all
  select user_id, (created_at at time zone 'UTC')::date from public.post_likes
  union all
  select user_id, (created_at at time zone 'UTC')::date from public.post_comments
  union all
  select user_id, (created_at at time zone 'UTC')::date from public.comment_likes
  union all
  select sender_id, (created_at at time zone 'UTC')::date from public.messages
  union all
  select follower_id, (created_at at time zone 'UTC')::date from public.follows
  union all
  select tagged_id, (coalesce(accepted_at, declined_at) at time zone 'UTC')::date
  from public.tag_challenges
  where tagged_id is not null and coalesce(accepted_at, declined_at) is not null
  union all
  select claimed_by, (claimed_at at time zone 'UTC')::date
  from public.invites
  where claimed_by is not null and claimed_at is not null
) a
join public.profiles p on p.id = a.user_id;

-- Every day from the first signup to today: what people did.
-- A friendship is counted once, on the day the second of the two follows was made.
create view stats.actions_daily as
select
  d.day,
  (select count(*) from public.profiles p
   where (p.created_at at time zone 'UTC')::date = d.day)::int as signups,
  (select count(*) from public.posts p
   where (p.created_at at time zone 'UTC')::date = d.day)::int as posts,
  (select count(*) from public.tag_challenges c
   where (c.created_at at time zone 'UTC')::date = d.day)::int as tags_sent,
  (select count(*) from public.tag_challenges c
   where (c.answered_at at time zone 'UTC')::date = d.day)::int as tags_answered,
  (select count(*) from public.follows f
   where (f.created_at at time zone 'UTC')::date = d.day)::int as follows,
  (select count(*) from public.follows f
   where (f.created_at at time zone 'UTC')::date = d.day
     and exists (
       select 1 from public.follows r
       where r.follower_id = f.following_id and r.following_id = f.follower_id
         and (r.created_at, r.id) < (f.created_at, f.id)
     ))::int as friendships,
  (select count(*) from public.messages m
   where (m.created_at at time zone 'UTC')::date = d.day)::int as messages,
  (select count(*) from public.post_comments c
   where (c.created_at at time zone 'UTC')::date = d.day)::int as comments,
  (select count(*) from public.post_likes l
   where (l.created_at at time zone 'UTC')::date = d.day)::int as likes,
  (select count(*) from public.invites i
   where (i.created_at at time zone 'UTC')::date = d.day)::int as invites_sent,
  (select count(*) from public.invites i
   where (i.claimed_at at time zone 'UTC')::date = d.day)::int as invites_claimed
from generate_series(
  (select min((created_at at time zone 'UTC')::date) from public.profiles),
  (now() at time zone 'UTC')::date,
  interval '1 day'
) as d(day);

-- Active people per day: that day (DAU), the 7 days to it (WAU), the 30 days to it (MAU).
-- Stickiness = DAU / MAU: the share of the month's people who show up on a given day.
create view stats.active_daily as
select
  d.day,
  s.dau,
  s.wau,
  s.mau,
  round(100.0 * s.dau / nullif(s.mau, 0), 1) as stickiness_pct
from generate_series(
  (select min((created_at at time zone 'UTC')::date) from public.profiles),
  (now() at time zone 'UTC')::date,
  interval '1 day'
) as d(day)
cross join lateral (
  select
    count(distinct a.user_id) filter (where a.day = d.day::date)::int as dau,
    count(distinct a.user_id) filter (where a.day > d.day::date - 7)::int as wau,
    count(distinct a.user_id)::int as mau
  from stats.activity a
  where a.day > d.day::date - 30 and a.day <= d.day::date
) s;

-- Weekly retention: of the people who signed up in a week, how many were active N weeks
-- later (week 0 = the signup week). Only weeks that have started are shown.
create view stats.retention_weekly as
with people as (
  select id as user_id, date_trunc('week', created_at at time zone 'UTC')::date as cohort_week
  from public.profiles
)
select
  p.cohort_week,
  w.weeks_after,
  count(*)::int as signups,
  count(*) filter (where exists (
    select 1 from stats.activity a
    where a.user_id = p.user_id
      and a.day >= p.cohort_week + 7 * w.weeks_after
      and a.day < p.cohort_week + 7 * (w.weeks_after + 1)
  ))::int as active,
  round(100.0 * count(*) filter (where exists (
    select 1 from stats.activity a
    where a.user_id = p.user_id
      and a.day >= p.cohort_week + 7 * w.weeks_after
      and a.day < p.cohort_week + 7 * (w.weeks_after + 1)
  )) / count(*), 1) as active_pct
from people p
cross join generate_series(0, 12) as w(weeks_after)
where p.cohort_week + 7 * w.weeks_after <= (now() at time zone 'UTC')::date
group by p.cohort_week, w.weeks_after;

-- Day 1 / 7 / 30 retention by signup week: active on exactly that day after signing up.
-- `_eligible` is how many have reached that day yet; the percentage is out of them.
create view stats.retention_days as
with people as (
  select id as user_id, (created_at at time zone 'UTC')::date as signup_day
  from public.profiles
),
marks as (
  select
    p.signup_day,
    n.after,
    p.signup_day + n.after <= (now() at time zone 'UTC')::date as eligible,
    exists (
      select 1 from stats.activity a where a.user_id = p.user_id and a.day = p.signup_day + n.after
    ) as returned
  from people p
  cross join (values (1), (7), (30)) as n(after)
)
select
  date_trunc('week', signup_day)::date as cohort_week,
  (count(*) / 3)::int as signups,
  count(*) filter (where after = 1 and eligible)::int as d1_eligible,
  count(*) filter (where after = 1 and returned)::int as d1_returned,
  round(100.0 * count(*) filter (where after = 1 and returned)
        / nullif(count(*) filter (where after = 1 and eligible), 0), 1) as d1_pct,
  count(*) filter (where after = 7 and eligible)::int as d7_eligible,
  count(*) filter (where after = 7 and returned)::int as d7_returned,
  round(100.0 * count(*) filter (where after = 7 and returned)
        / nullif(count(*) filter (where after = 7 and eligible), 0), 1) as d7_pct,
  count(*) filter (where after = 30 and eligible)::int as d30_eligible,
  count(*) filter (where after = 30 and returned)::int as d30_returned,
  round(100.0 * count(*) filter (where after = 30 and returned)
        / nullif(count(*) filter (where after = 30 and eligible), 0), 1) as d30_pct
from marks
group by 1;

-- Activation by signup week, as a funnel: signed up -> posted -> answered a tag, each within
-- 7 days of signing up; followed someone alongside. Activated = posted within 7 days.
create view stats.activation_weekly as
with people as (
  select
    p.id as user_id,
    date_trunc('week', p.created_at at time zone 'UTC')::date as cohort_week,
    exists (
      select 1 from public.posts x
      where x.user_id = p.id and x.created_at < p.created_at + interval '7 days'
    ) as posted,
    exists (
      select 1 from public.tag_challenges c
      where c.tagged_id = p.id and c.answered_at < p.created_at + interval '7 days'
    ) as answered,
    exists (
      select 1 from public.follows f
      where f.follower_id = p.id and f.created_at < p.created_at + interval '7 days'
    ) as followed
  from public.profiles p
)
select
  cohort_week,
  count(*)::int as signups,
  count(*) filter (where posted)::int as first_post_7d,
  count(*) filter (where answered)::int as answered_tag_7d,
  count(*) filter (where followed)::int as followed_7d,
  round(100.0 * count(*) filter (where posted) / count(*), 1) as activated_pct,
  round(100.0 * count(*) filter (where answered) / count(*), 1) as answered_tag_pct
from people
group by cohort_week;

-- Each week, active people split by where they came from, and who stopped (churn signal):
--   new — signed up this week; retained — also active last week; resurrected — back after a
--   gap; dormant — active last week, not this week.
create view stats.lifecycle_weekly as
with aw as (
  select distinct user_id, date_trunc('week', day)::date as week from stats.activity
),
signed as (
  select id as user_id, date_trunc('week', created_at at time zone 'UTC')::date as week
  from public.profiles
),
weeks as (
  select generate_series(
    (select min(week) from aw),
    date_trunc('week', now() at time zone 'UTC')::date,
    interval '1 week'
  )::date as week
)
select
  w.week,
  (select count(*) from aw where aw.week = w.week)::int as active,
  (select count(*) from aw join signed s using (user_id)
   where aw.week = w.week and s.week = w.week)::int as new,
  (select count(*) from aw join signed s using (user_id)
   where aw.week = w.week and s.week <> w.week
     and exists (select 1 from aw prev where prev.user_id = aw.user_id and prev.week = w.week - 7)
  )::int as retained,
  (select count(*) from aw join signed s using (user_id)
   where aw.week = w.week and s.week <> w.week
     and not exists (select 1 from aw prev where prev.user_id = aw.user_id and prev.week = w.week - 7)
  )::int as resurrected,
  (select count(*) from aw prev
   where prev.week = w.week - 7
     and not exists (select 1 from aw cur where cur.user_id = prev.user_id and cur.week = w.week)
  )::int as dormant
from weeks w;

revoke all on all tables in schema stats from anon, authenticated;

-- PostHog's read-only door: the totals in `stats`, never an app table or `stats.activity`.
do $$
begin
  create role posthog_reader nologin;
exception when duplicate_object then null;
end $$;
grant usage on schema stats to posthog_reader;
grant select on
  stats.actions_daily, stats.active_daily, stats.retention_weekly, stats.retention_days,
  stats.activation_weekly, stats.lifecycle_weekly,
  stats.tags_daily, stats.posts_daily, stats.invites_daily, stats.users_weekly
to posthog_reader;
