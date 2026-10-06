-- Undo 20261006120000_push_deadline_wording: the pushes go back to 20261003120000_tag_slots'
-- words ("You've just been tagged by @sam. 48 hours left to post your Mahi!", "24 hours left to
-- post your Mahi! @sam is waiting.", "@sam missed your tag", "answered your tag in 3h"), written
-- when queued; the 2-hours-left reminder is again dropped for early-morning deadlines. Pushes
-- queued and not yet sent get the old words back.
begin;

-- Queued pushes: the old words (the hours in the tag push from app_config.tag_window).
update public.push_outbox o
set body = substring(o.dedupe_key from ':(\d+)h$') || ' hours left to post your Mahi! @'
           || p.username || ' is waiting.'
from public.tag_challenges c
join public.profiles p on p.id = c.tagger_id
where o.kind = 'tag_reminder' and o.sent_at is null and o.challenge_id = c.id;

update public.push_outbox o
set body = 'You''ve just been tagged by @' || p.username || '. '
           || floor(extract(epoch from cfg.tag_window) / 3600)::int || ' hours left to post your Mahi!'
from public.tag_challenges c
join public.profiles p on p.id = c.tagger_id
cross join public.app_config cfg
where o.kind = 'tag' and o.sent_at is null and o.challenge_id = c.id and o.body like '%{deadline}%';

update public.push_outbox
set body = replace(body, '. A quick message could get them back to it.', '')
where kind = 'tag_missed' and sent_at is null;

-- Bodies from 20261003120000_tag_slots (queue_tag_pushes, push_on_notification) and
-- 20261002190000_tag_and_feed_pushes (claim_push_batch).
create or replace function public.queue_tag_pushes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tagger text;
begin
  if new.tagged_id is null then
    return new;                       -- an invite nobody has claimed yet
  end if;

  if (tg_op = 'INSERT' or old.tagged_id is null or old.expires_at is null)
     and new.expires_at is not null
     and new.answered_at is null and new.cancelled_at is null and new.missed_at is null then
    select username into v_tagger from public.profiles where id = new.tagger_id;
    perform public.enqueue_push(
      new.tagged_id, new.tagger_id, 'tag_reminder',
      r.hours_left || ' hours left to post your Mahi! @' || v_tagger || ' is waiting.',
      jsonb_build_object('route', 'camera'),
      new.expires_at - make_interval(hours => r.hours_left),
      'tag:' || new.id || ':' || r.hours_left || 'h',
      new.id,
      new.expires_at
    )
    from (values (24), (2)) r(hours_left)
    -- A reminder whose moment has already passed (a shorter tag window) is not sent.
    where new.expires_at - make_interval(hours => r.hours_left) > now();
  end if;

  perform public.schedule_feed_lock_pushes(new.tagged_id);
  return new;
end;
$$;

create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_c public.tag_challenges;
  v_hours int;
begin
  select '@' || username into v_actor from public.profiles where id = new.actor_id;

  if new.challenge_id is not null then
    select * into v_c from public.tag_challenges where id = new.challenge_id;
  elsif new.type = 'tag' then
    select * into v_c from public.tag_challenges
    where post_id = new.post_id and tagged_id = new.user_id;
  end if;
  select floor(extract(epoch from tag_window) / 3600)::int into v_hours from public.app_config;

  perform public.enqueue_push(
    new.user_id,
    new.actor_id,
    new.type,
    case new.type
      when 'like' then v_actor || ' liked your post'
      when 'comment' then v_actor || ' commented on your post'
      when 'follow' then v_actor || ' started following you'
      when 'tag' then
        case when v_c.id is null then v_actor || ' tagged you in a post'
             else 'You''ve just been tagged by ' || v_actor || '. ' || v_hours
                  || ' hours left to post your Mahi!' end
      when 'tag_answered' then
        v_actor || ' answered your tag in '
          || public.format_wait(v_c.answered_at - coalesce(v_c.started_at, v_c.created_at))
      when 'tag_missed' then v_actor || ' missed your tag'
      when 'invite_joined' then v_actor || ' joined Mahi from your invite'
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your points are back to 0.'
      when 'tag_invite' then v_actor || ' wants to tag you'
      when 'tag_invite_accepted' then v_actor || ' accepted your tag'
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
    where o.sent_at is null and o.send_after < now() - cfg.push_stale_after
  ),
  due as (
    select o.id
    from public.push_outbox o
    cross join public.app_config cfg
    where o.sent_at is null
      and o.send_after <= now()
      and o.send_after >= now() - cfg.push_stale_after
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
    returning o.id, o.user_id, o.kind, o.body, o.data
  )
  select c.id, c.user_id, c.kind, c.body, c.data,
         coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = c.user_id), '{}')
  from claimed c;
$$;

drop function public.last_call_time(timestamptz, timestamptz, text);
drop function public.format_duration(interval);
drop function public.format_deadline(timestamptz, text, timestamptz);

delete from supabase_migrations.schema_migrations where version = '20261006120000';
notify pgrst, 'reload schema';

commit;
