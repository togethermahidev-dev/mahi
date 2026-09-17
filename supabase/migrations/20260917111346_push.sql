-- Push notifications (tag-loop plan, Phase 1).
-- Device tokens, a transactional outbox, quiet hours, and a cron that hands due rows to the
-- `send-push` Edge Function. Anything that should push inserts an outbox row in the same
-- transaction as the change it announces; the worker claims rows with SKIP LOCKED, so a push is
-- sent at most once per claim and stale claims are retried after 5 minutes.
-- Test: supabase/tests/push_test.sql

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 1. Server-side settings, one row. Later phases add their own columns.
create table public.app_config (
  id boolean primary key default true check (id),
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00'
);
insert into public.app_config default values;
alter table public.app_config enable row level security;
create policy app_config_select on public.app_config for select to authenticated using (true);

-- 2. Device tokens. One owner per token; only the RPCs below touch this table.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_id_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- 3. The outbox.
create table public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  body text not null,
  data jsonb not null default '{}',
  send_after timestamptz not null default now(),
  dedupe_key text unique,
  claimed_at timestamptz,
  sent_at timestamptz,
  tickets jsonb,               -- [{ticket, token}] from Expo, for receipt checks
  error text,
  receipts_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_outbox_due_idx on public.push_outbox (send_after) where sent_at is null;
create index push_outbox_receipts_idx on public.push_outbox (sent_at)
  where tickets is not null and receipts_checked_at is null;
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

-- 4. Quiet hours: a send time inside the window moves to its end, in the recipient's zone.
create function public.push_send_time(p_at timestamptz, p_tz text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  qs time;
  qe time;
  loc timestamp := p_at at time zone p_tz;
  t time := loc::time;
  d date := loc::date;
begin
  select quiet_start, quiet_end into qs, qe from public.app_config;
  if qs is null or qs = qe then
    return p_at;
  end if;
  if qs > qe then                      -- window crosses midnight, e.g. 22:00–07:00
    if t >= qs then
      return ((d + 1) + qe) at time zone p_tz;
    elsif t < qe then
      return (d + qe) at time zone p_tz;
    end if;
  elsif t >= qs and t < qe then
    return (d + qe) at time zone p_tz;
  end if;
  return p_at;
end;
$$;

-- 5. Queue a push. Internal only: called by triggers and other SECURITY DEFINER functions.
create function public.enqueue_push(
  p_user uuid,
  p_actor uuid,
  p_kind text,
  p_body text,
  p_data jsonb,
  p_send_after timestamptz default now(),
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
begin
  if p_actor is not null and (
    p_actor = p_user
    or exists (
      select 1 from public.user_blocks
      where (blocker_id = p_user and blocked_id = p_actor)
         or (blocker_id = p_actor and blocked_id = p_user)
    )
    or exists (select 1 from public.profiles where id = p_actor and is_banned)
  ) then
    return;
  end if;

  select timezone into v_tz from public.profiles where id = p_user and not is_banned;
  if not found then
    return;
  end if;

  insert into public.push_outbox (user_id, kind, body, data, send_after, dedupe_key)
  values (p_user, p_kind, p_body, coalesce(p_data, '{}'),
          public.push_send_time(p_send_after, v_tz), p_dedupe_key)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- 6. Client RPCs: register / unregister this device's token.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' then
    raise exception 'invalid push token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- 7. Worker RPCs (service role only).
create function public.claim_push_batch(p_limit int default 500)
returns table (id bigint, user_id uuid, kind text, body text, data jsonb, tokens text[])
language sql
security definer
set search_path = public
as $$
  with due as (
    select o.id
    from public.push_outbox o
    where o.sent_at is null
      and o.send_after <= now()
      and (o.claimed_at is null or o.claimed_at < now() - interval '5 minutes')
    order by o.send_after
    limit p_limit
    for update skip locked
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

-- p_results: [{id, tickets?: [{ticket, token}], error?}]
create function public.complete_push(p_results jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_outbox o
  set sent_at = now(),
      tickets = r.tickets,
      error = r.error,
      receipts_checked_at = case when r.tickets is null then now() end
  from jsonb_to_recordset(p_results) as r(id bigint, tickets jsonb, error text)
  where o.id = r.id;
$$;

create function public.remove_push_tokens(p_tokens text[])
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = any(p_tokens);
$$;

-- Expo keeps receipts for 24 hours; check tickets 15 minutes to 24 hours old.
create function public.pending_push_receipts(p_limit int default 1000)
returns table (id bigint, tickets jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.tickets
  from public.push_outbox o
  where o.tickets is not null
    and o.receipts_checked_at is null
    and o.sent_at < now() - interval '15 minutes'
    and o.sent_at > now() - interval '24 hours'
  order by o.sent_at
  limit p_limit;
$$;

create function public.mark_push_receipts_checked(p_ids bigint[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_outbox set receipts_checked_at = now() where id = any(p_ids);
$$;

-- 8. Existing activity pushes through the same path.
create function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  select '@' || username into v_actor from public.profiles where id = new.actor_id;
  perform public.enqueue_push(
    new.user_id,
    new.actor_id,
    new.type,
    case new.type
      when 'like' then v_actor || ' liked your post'
      when 'comment' then v_actor || ' commented on your post'
      when 'follow' then v_actor || ' started following you'
      when 'tag' then v_actor || ' tagged you in a post'
      else v_actor
    end,
    jsonb_build_object(
      'route', case when new.type = 'follow' then 'profile' else 'post' end,
      'post_id', new.post_id,
      'user_id', new.actor_id,
      'notification_id', new.id
    ),
    now(),
    'notification:' || new.id
  );
  return new;
end;
$$;

create trigger push_on_notification
  after insert on public.notifications
  for each row execute function public.push_on_notification();

-- 9. Cron → Edge Function. Skips the HTTP call when there is nothing to do, and until the
-- `send_push_url` / `send_push_secret` Vault secrets exist.
create function public.invoke_send_push(p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if p_mode = 'send' and not exists (
    select 1 from public.push_outbox where sent_at is null and send_after <= now()
  ) then
    return;
  end if;
  if p_mode = 'receipts' and not exists (select 1 from public.pending_push_receipts(1)) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'send_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'send_push_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('mode', p_mode),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Internal-Secret', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;

select cron.schedule('send-push', '* * * * *', $$select public.invoke_send_push('send')$$);
select cron.schedule('push-receipts', '*/15 * * * *', $$select public.invoke_send_push('receipts')$$);

-- 10. Who may call what.
revoke execute on function
  public.push_send_time(timestamptz, text),
  public.enqueue_push(uuid, uuid, text, text, jsonb, timestamptz, text),
  public.register_push_token(text, text),
  public.unregister_push_token(text),
  public.claim_push_batch(int),
  public.complete_push(jsonb),
  public.remove_push_tokens(text[]),
  public.pending_push_receipts(int),
  public.mark_push_receipts_checked(bigint[]),
  public.push_on_notification(),
  public.invoke_send_push(text)
from public, anon, authenticated;

grant execute on function
  public.register_push_token(text, text),
  public.unregister_push_token(text)
to authenticated;

grant execute on function
  public.claim_push_batch(int),
  public.complete_push(jsonb),
  public.remove_push_tokens(text[]),
  public.pending_push_receipts(int),
  public.mark_push_receipts_checked(bigint[])
to service_role;

notify pgrst, 'reload schema';
