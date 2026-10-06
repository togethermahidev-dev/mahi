-- Push wording, round 5 (owner approved changing #54–#57, 2026-10-06; findings in the local
-- docs/design-gaps.md, round 3 gap 1 and Q2, round 2 gap 5, decision #86).
--
-- 1. Deadlines are a day and a clock time in the person's own time zone, never "48 hours left":
--      tag push      "@sam tagged you. Post any workout by Thu 10:40pm."
--      24 hours      "Answer @sam's tag by 10:40pm tomorrow."
--      2 hours       "Last call: answer @sam's tag by 10:40pm tonight."
--    No "just", no "post your Mahi", no "is waiting", no exclamation marks.
-- 2. The words are worked out when the push is SENT, not when it is queued. A push held by quiet
--    hours (22:00–07:00) used to arrive at 07:00 still saying "You've just been tagged… 48 hours
--    left" (really 39). The queue now stores "{deadline}" and claim_push_batch fills it in from
--    the tag's deadline, in the person's time zone, at the moment it hands the push to send-push.
-- 3. The 2-hours-left reminder is no longer lost for an early-morning deadline. When quiet hours
--    would hold it past the deadline (any deadline between about midnight and 09:00), it goes
--    out 15 minutes before quiet hours start the evening before ("Last call: … by 6:00am
--    tomorrow."). Everything else about who gets what, and when, is unchanged.
-- 4. "@sam missed your tag. A quick message could get them back to it." (a next step for the
--    tagger), "@sam answered your tag in 3 hours" (times in words), "@sam accepted your tag
--    request" (decision #86's word).
-- The feed pushes (#56), likes, comments, follows, joins, points and messages keep their words.
-- The app's notification rows (ui/src/lib/notificationText.ts) are the app's to match.
--
-- Builds on 20261003120000_tag_slots (push_on_notification, queue_tag_pushes) and
-- 20261002190000_tag_and_feed_pushes (claim_push_batch): push those first.
-- Test: supabase/tests/push_deadline_wording_test.sql (also tag_feed_pushes, tag_challenges,
-- invites, tag_slots)
-- Undo: supabase/rollbacks/20261006120000_push_deadline_wording.rollback.sql

-- 1. "10:40pm tonight", "9:00am today", "10:40pm tomorrow", "Thu 10:40pm", "12 Oct 10:40pm":
--    a deadline as the person would say it, in their time zone, seen from p_now.
create function public.format_deadline(p_at timestamptz, p_tz text, p_now timestamptz default now())
returns text
language sql
stable
set search_path = public
as $$
  select case
           when days <= 0 then t || case when extract(hour from loc) >= 17 then ' tonight' else ' today' end
           when days = 1 then t || ' tomorrow'
           when days < 7 then to_char(loc, 'Dy') || ' ' || t
           else to_char(loc, 'FMDD Mon') || ' ' || t
         end
  from (select p_at at time zone coalesce(p_tz, 'UTC') as loc,
               (p_at at time zone coalesce(p_tz, 'UTC'))::date
                 - (p_now at time zone coalesce(p_tz, 'UTC'))::date as days) x
  cross join lateral (select to_char(x.loc, 'FMHH12:MIam') as t) y;
$$;

-- 2. "45 minutes", "3 hours", "1 day 2 hours" (format_wait wrote "45m", "3h", "1d 2h").
create function public.format_duration(p interval)
returns text
language sql
immutable
as $$
  select case
    when p < interval '1 hour' then m || case when m = 1 then ' minute' else ' minutes' end
    when p < interval '1 day' then h || case when h = 1 then ' hour' else ' hours' end
    else d || case when d = 1 then ' day' else ' days' end
         || case when h % 24 = 0 then ''
                 when h % 24 = 1 then ' 1 hour'
                 else ' ' || (h % 24) || ' hours' end
  end
  from (select greatest(floor(extract(epoch from p) / 60)::int, 1) as m,
               floor(extract(epoch from p) / 3600)::int as h,
               floor(extract(epoch from p) / 86400)::int as d) x;
$$;

-- 3. When a reminder due at p_due goes out: p_due as before, unless quiet hours would hold it
--    past p_deadline — then 15 minutes before those quiet hours start.
create function public.last_call_time(p_due timestamptz, p_deadline timestamptz, p_tz text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  qs time;
  qe time;
  loc timestamp := p_due at time zone p_tz;
  t time := loc::time;
  d date := loc::date;
begin
  if public.push_send_time(p_due, p_tz) <= p_deadline then
    return p_due;
  end if;
  select quiet_start, quiet_end into qs, qe from public.app_config;
  if qs > qe and t < qe then        -- after midnight: the quiet hours began the evening before
    d := d - 1;
  end if;
  return ((d + qs) at time zone p_tz) - interval '15 minutes';
end;
$$;

-- 4. The reminders (20261003120000_tag_slots' body; the words and the last-call time change).
create or replace function public.queue_tag_pushes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tagger text;
  v_tz text;
begin
  if new.tagged_id is null then
    return new;                       -- an invite nobody has claimed yet
  end if;

  if (tg_op = 'INSERT' or old.tagged_id is null or old.expires_at is null)
     and new.expires_at is not null
     and new.answered_at is null and new.cancelled_at is null and new.missed_at is null then
    select username into v_tagger from public.profiles where id = new.tagger_id;
    select timezone into v_tz from public.profiles where id = new.tagged_id;
    perform public.enqueue_push(
      new.tagged_id, new.tagger_id, 'tag_reminder',
      case r.hours_left
        when 2 then 'Last call: answer @' || v_tagger || '''s tag by {deadline}.'
        else 'Answer @' || v_tagger || '''s tag by {deadline}.'
      end,
      jsonb_build_object('route', 'camera'),
      r.send_at,
      'tag:' || new.id || ':' || r.hours_left || 'h',
      new.id,
      new.expires_at
    )
    from (
      select h.hours_left,
             case when h.hours_left = 2
                  then public.last_call_time(new.expires_at - interval '2 hours', new.expires_at,
                                             coalesce(v_tz, 'UTC'))
                  else new.expires_at - make_interval(hours => h.hours_left)
             end as send_at
      from (values (24), (2)) h(hours_left)
    ) r
    -- A reminder whose moment has already passed (a shorter tag window) is not sent.
    where r.send_at > now();
  end if;

  perform public.schedule_feed_lock_pushes(new.tagged_id);
  return new;
end;
$$;

-- 5. The notification pushes (20261003120000_tag_slots' body; the tag, answered, missed and
--    accepted words change).
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_c public.tag_challenges;
begin
  select '@' || username into v_actor from public.profiles where id = new.actor_id;

  if new.challenge_id is not null then
    select * into v_c from public.tag_challenges where id = new.challenge_id;
  elsif new.type = 'tag' then
    select * into v_c from public.tag_challenges
    where post_id = new.post_id and tagged_id = new.user_id;
  end if;

  perform public.enqueue_push(
    new.user_id,
    new.actor_id,
    new.type,
    case new.type
      when 'like' then v_actor || ' liked your post'
      when 'comment' then v_actor || ' commented on your post'
      when 'follow' then v_actor || ' started following you'
      when 'tag' then
        case when v_c.id is null or v_c.expires_at is null then v_actor || ' tagged you in a post'
             else v_actor || ' tagged you. Post any workout by {deadline}.' end
      when 'tag_answered' then
        v_actor || ' answered your tag in '
          || public.format_duration(v_c.answered_at - coalesce(v_c.started_at, v_c.created_at))
      when 'tag_missed' then v_actor || ' missed your tag. A quick message could get them back to it.'
      when 'invite_joined' then v_actor || ' joined Mahi from your invite'
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your points are back to 0.'
      when 'tag_invite' then v_actor || ' wants to tag you'
      when 'tag_invite_accepted' then v_actor || ' accepted your tag request'
      else v_actor
    end,
    jsonb_build_object(
      'route', case
        when new.type = 'follow' then 'profile'
        when new.type = 'tag' and v_c.id is not null then 'camera'
        when new.type = 'invite_joined' then 'profile'
        else 'post'
      end,
      'post_id', new.post_id,
      'user_id', new.actor_id,
      'notification_id', new.id
    ),
    now(),
    'notification:' || new.id,
    v_c.id
  );
  return new;
end;
$$;

-- 6. The sender gets the words as of now (20261002190000_tag_and_feed_pushes' body, plus the
--    {deadline} fill-in). A push that needs a deadline its tag no longer has is closed as stale.
create or replace function public.claim_push_batch(p_limit int default 500)
returns table (id bigint, user_id uuid, kind text, body text, data jsonb, tokens text[])
language sql
security definer
set search_path = public
as $$
  with stale as (
    update public.push_outbox o
    set sent_at = now(), error = 'stale', receipts_checked_at = now()
    from public.app_config cfg
    where o.sent_at is null
      and (o.send_after < now() - cfg.push_stale_after
           or (o.send_after <= now()
               and o.body like '%{deadline}%'
               and not exists (select 1 from public.tag_challenges c
                               where c.id = o.challenge_id and c.expires_at > now())))
  ),
  due as (
    select o.id
    from public.push_outbox o
    cross join public.app_config cfg
    where o.sent_at is null
      and o.send_after <= now()
      and o.send_after >= now() - cfg.push_stale_after
      and (o.body not like '%{deadline}%'
           or exists (select 1 from public.tag_challenges c
                      where c.id = o.challenge_id and c.expires_at > now()))
      and (o.claimed_at is null or o.claimed_at < now() - interval '5 minutes')
    order by o.send_after
    limit p_limit
    for update of o skip locked
  ),
  claimed as (
    update public.push_outbox o
    set claimed_at = now()
    from due
    where o.id = due.id
    returning o.id, o.user_id, o.kind, o.body, o.data, o.challenge_id
  )
  select c.id, c.user_id, c.kind,
         case when c.body like '%{deadline}%' then
           replace(c.body, '{deadline}', public.format_deadline(
             (select t.expires_at from public.tag_challenges t where t.id = c.challenge_id),
             (select p.timezone from public.profiles p where p.id = c.user_id),
             now()))
         else c.body end,
         c.data,
         coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = c.user_id), '{}')
  from claimed c;
$$;

-- 7. Pushes already queued and not sent take the new words (nothing has been sent on
--    production: send-push is not deployed).
update public.push_outbox o
set body = case
      when o.dedupe_key like '%:2h' then 'Last call: answer @' || p.username || '''s tag by {deadline}.'
      else 'Answer @' || p.username || '''s tag by {deadline}.'
    end
from public.tag_challenges c
join public.profiles p on p.id = c.tagger_id
where o.kind = 'tag_reminder' and o.sent_at is null and o.challenge_id = c.id;

update public.push_outbox o
set body = '@' || p.username || ' tagged you. Post any workout by {deadline}.'
from public.tag_challenges c
join public.profiles p on p.id = c.tagger_id
where o.kind = 'tag' and o.sent_at is null and o.challenge_id = c.id and c.expires_at is not null;

revoke execute on function
  public.format_deadline(timestamptz, text, timestamptz),
  public.format_duration(interval),
  public.last_call_time(timestamptz, timestamptz, text)
from public, anon, authenticated;

notify pgrst, 'reload schema';
