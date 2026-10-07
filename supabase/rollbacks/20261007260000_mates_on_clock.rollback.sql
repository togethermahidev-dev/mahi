-- Undo 20261007260000_mates_on_clock: the waiting camera loses who is on the clock (apps that read
-- it fall back to "Waiting for a mate to tag you"), and every miss tells the person who missed
-- again, even at 0 points. Bodies are 20261001120000_reactive_posting's (production's before).
begin;
drop function if exists public.get_mates_on_clock();

create or replace function public.break_missed_streaks(p_user uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  with missed as (
    update public.tag_challenges c
    set missed_at = now()
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
    returning c.id, c.post_id, c.tagger_id, c.tagged_id
  )
  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  select tagger_id, tagged_id, 'tag_missed', post_id, id from marked
  union all
  select tagged_id, tagger_id, 'streak_lost', post_id, id from marked;
$$;

alter table public.tag_challenges drop column if exists missed_points;

notify pgrst, 'reload schema';
commit;
