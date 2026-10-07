-- The invite funnel of record, by week (owner, 2026-10-07: "how many invites work as sign-ups"):
-- links made, of them links for a mate (no tag behind them, 20261007190100_invite_a_mate),
-- people who joined from them, and of those who went on to post. Totals only; PostHog reads it
-- through posthog_reader (20261007160000_founder_stats). Opens of a link are counted in PostHog
-- (invite_page_opened, invite_link_opened): the database never sees them.
create view stats.invites_weekly as
select
  date_trunc('week', i.created_at at time zone 'UTC')::date as week,
  count(*)::int as made,
  count(*) filter (where i.challenge_id is null)::int as mate_links,
  count(*) filter (where i.claimed_at is not null)::int as joined,
  count(*) filter (
    where i.claimed_at is not null
      and exists (select 1 from public.posts p where p.user_id = i.claimed_by)
  )::int as joined_and_posted,
  round(100.0 * count(*) filter (where i.claimed_at is not null) / nullif(count(*), 0), 1)
    as joined_pct
from public.invites i
group by 1;

revoke all on stats.invites_weekly from anon, authenticated;
grant select on stats.invites_weekly to posthog_reader;
