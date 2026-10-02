-- Identity checks with Didit (app flag `identity-verification`, default off; dormant in build 11).
--   didit-session  (edge function) creates a Didit session for the signed-in person and stores a
--                  placeholder row here ('pending', event time = epoch)
--   didit-webhook  (edge function) checks Didit's signature and records each status change
-- One row per Didit session. The real result lives only here: what the phone saw is a hint.
-- Writes go only through record_identity_verification (service role). Each person reads only
-- their own rows. `decision` holds statuses only (see minimalDecision in
-- supabase/functions/_shared/didit.ts) — never names, document numbers, dates of birth or images.
-- Additive: nothing reads it unless the flag is on.
-- Test: supabase/tests/identity_verifications_test.sql
-- Undo: supabase/rollbacks/20261002150000_identity_verifications.rollback.sql

create table public.identity_verifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    text not null unique,
  status        text not null
                check (status in ('pending', 'in_review', 'approved', 'declined', 'expired')),
  didit_status  text,
  decision      jsonb not null default '{}'::jsonb,
  -- Didit's event time of the newest webhook applied; older ones arriving late are ignored.
  last_event_at timestamptz not null default 'epoch',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index identity_verifications_user_idx
  on public.identity_verifications (user_id, updated_at desc);

alter table public.identity_verifications enable row level security;
create policy identity_verifications_select_own on public.identity_verifications
  for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.identity_verifications from anon;
revoke insert, update, delete, truncate on public.identity_verifications from authenticated;

-- Record a session or a status change. Returns:
--   'saved'         stored (also for the same event again: Didit retries)
--   'stale'         an older event than the one already applied; nothing changed
--   'unknown_user'  a new session for someone with no account; nothing stored
-- A session belongs to whoever it was first stored for; p_user_id is used only for a new row.
create function public.record_identity_verification(
  p_session_id   text,
  p_user_id      uuid,
  p_status       text,
  p_didit_status text,
  p_decision     jsonb,
  p_event_at     timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.identity_verifications where session_id = p_session_id) then
    if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
      return 'unknown_user';
    end if;
    insert into public.identity_verifications
      (user_id, session_id, status, didit_status, decision, last_event_at)
    values
      (p_user_id, p_session_id, p_status, p_didit_status, coalesce(p_decision, '{}'::jsonb), p_event_at)
    on conflict (session_id) do nothing;
    if found then
      return 'saved';
    end if;
    -- Another call stored it a moment ago: fall through and update it like any webhook.
  end if;

  update public.identity_verifications
     set status        = p_status,
         didit_status  = p_didit_status,
         decision      = coalesce(p_decision, '{}'::jsonb),
         last_event_at = p_event_at,
         updated_at    = now()
   where session_id = p_session_id
     and last_event_at <= p_event_at;
  if found then
    return 'saved';
  end if;
  return 'stale';
end;
$$;
revoke execute on function public.record_identity_verification(text, uuid, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_identity_verification(text, uuid, text, text, jsonb, timestamptz)
  to service_role;
