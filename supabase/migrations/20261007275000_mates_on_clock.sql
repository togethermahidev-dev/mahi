-- Who is on the clock (usability walkthrough, owner, 2026-10-07).
-- 1. get_mates_on_clock(): the waiting camera says "Your mates are on the clock: @a, @b and @c have
--    31:12:00 to answer you." It reads your own tags whose 48 hours are running (started, not
--    answered, missed or cancelled, inside the grace), soonest first. Read-only; signed-in only.
-- 2. "Your points are back to 0" only when there were points to lose. A miss at 0 points no longer
--    makes a streak_lost row (so no push and no in-app moment); the tagger still hears every miss.
--    break_missed_streaks keeps the points each tag cost in tag_challenges.missed_points, read in
--    the same statement that resets them. Several tags missed in one run are one message (the
--    tag that ran out first). Tags marked missed before this migration (missed_points null) are
--    told as before.
-- Bodies of break_missed_streaks and mark_missed_tags are 20261001120000_reactive_posting's,
-- checked against prod 2026-10-07. Test: supabase/tests/mates_on_clock_test.sql
-- Rollback: supabase/rollbacks/20261007275000_mates_on_clock.rollback.sql

-- 1. Your mates on the clock.
create function public.get_mates_on_clock()
returns table (
  challenge_id uuid, user_id uuid, username text, expires_at timestamptz, server_now timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, p.id, p.username, c.expires_at, now()
  from public.tag_challenges c
  join public.profiles p on p.id = c.tagged_id and not p.is_banned
  cross join public.app_config cfg
  where c.tagger_id = auth.uid()
    and c.expires_at is not null
    and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
    and now() <= c.expires_at + cfg.answer_grace
  order by c.expires_at;
$$;

revoke execute on function public.get_mates_on_clock() from public, anon, authenticated;
grant execute on function public.get_mates_on_clock() to authenticated;

-- 2. The points a miss cost.
alter table public.tag_challenges add column missed_points int;

create or replace function public.break_missed_streaks(p_user uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  with missed as (
    update public.tag_challenges c
    set missed_at = now(),
        missed_points = (select pr.streak_current from public.profiles pr where pr.id = c.tagged_id)
    from public.app_config cfg
    where c.tagged_id is not null
      and (p_user is null or c.tagged_id = p_user)
      and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
      and c.expires_at < now() - cfg.answer_grace
    returning c.tagged_id
  )
  update public.profiles p
  set streak_current = 0
  where p.id in (select tagged_id from missed) and p.streak_current <> 0;
$$;

create or replace function public.mark_missed_tags()
returns void
language sql
security definer
set search_path = public
as $$
  select public.break_missed_streaks();

  with due as (
    select c.id
    from public.tag_challenges c
    cross join public.app_config cfg
    where c.answered_at is null and c.cancelled_at is null and c.missed_notified_at is null
      and c.expires_at < now() - cfg.answer_grace
    for update of c skip locked
  ),
  marked as (
    update public.tag_challenges c
    set missed_at = coalesce(c.missed_at, now()), missed_notified_at = now()
    from due
    where c.id = due.id
    returning c.id, c.post_id, c.tagger_id, c.tagged_id, c.expires_at, c.missed_points
  )
  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  select tagger_id, tagged_id, 'tag_missed', post_id, id from marked
  union all
  select * from (
    select distinct on (tagged_id) tagged_id, tagger_id, 'streak_lost', post_id, id
    from marked
    where coalesce(missed_points, 1) > 0
    order by tagged_id, expires_at, id
  ) lost;
$$;

notify pgrst, 'reload schema';
