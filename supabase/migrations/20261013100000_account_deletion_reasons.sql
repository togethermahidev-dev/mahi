-- Why people delete their account, and what is kept afterwards (owner, 2026-10-13: a reason on
-- the way out, a Slack message for each deletion, "only keep what we are allowed").
-- 1. account_deletion_reason_label(p_reason): the one list of reasons and the words for each.
--    Both tables check their reason against it; adding a reason later means replacing only this.
-- 2. public.account_deletion_reasons: what a person said just before deleting. It belongs to the
--    account (one row each, keyed by the profile) and goes with it. The app has no rights on it.
-- 3. set_account_deletion_reason(p_reason, p_note): the only way to leave a reason, and only
--    your own (the caller is auth.uid(); there is no user id to pass). A reason not on the list,
--    or the server's own 'not_given', is refused with 22023 'unknown reason'. The words are kept
--    only with 'other', tidied like a bio (invisible characters out, line breaks and runs of
--    spaces as one space, ends trimmed; nothing left = no words); more than 180 characters is
--    refused with 22023 'note is too long: 180 characters at most'. Answering again replaces the
--    earlier answer. A failure here must never stop a deletion: the app carries on without it.
-- 4. public.account_deletions: the row kept for each deleted account. It has no column that
--    says who it was: the reason, their words, roughly how old the account was (four steps) and
--    whether it had ever posted. Written by a trigger when the profile row goes, whoever deletes
--    it (the delete-account function, staff, the dashboard), so no deletion is missed. With no
--    reason, or one left more than an hour before (an earlier try that failed), the reason is
--    'not_given'. The app has no rights on it.
-- 5. account_deletion_slack_text(...) and notify_account_deletion(): each kept row is posted to
--    Slack from that row alone, through pg_net, to the address in the Vault secret
--    'account_deletions_slack_url' (a Slack incoming webhook, set by the owner). No secret, or
--    an address that is not Slack's: nothing is sent. Their words can't ping a channel or make
--    a link (&, < and > are escaped). Slack failing never stops a deletion.
-- 6. stats.account_deletions_daily: deletions per UTC day and reason, for PostHog's reader. The
--    words stay out of it.
-- Test: supabase/tests/account_deletion_reasons_test.sql
-- Undo: supabase/rollbacks/20261013100000_account_deletion_reasons.rollback.sql

create function public.account_deletion_reason_label(p_reason text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_reason
    when 'not_using' then 'I don’t use it enough'
    when 'friends_not_here' then 'My friends aren’t on Mahi'
    when 'too_much_pressure' then 'Tags feel like too much pressure'
    when 'not_working' then 'Something isn’t working properly'
    when 'privacy' then 'I’m worried about my privacy'
    when 'new_account' then 'I’m starting again with a new account'
    when 'other' then 'Something else'
    when 'rather_not_say' then 'I’d rather not say'
    -- The server's own: no reason came with the deletion. Nobody can pick it.
    when 'not_given' then 'No reason given'
  end
$$;

create table public.account_deletion_reasons (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  reason     text not null check (
    public.account_deletion_reason_label(reason) is not null and reason <> 'not_given'),
  note       text check (char_length(note) between 1 and 180),
  created_at timestamptz not null default now()
);

create table public.account_deletions (
  id          uuid primary key default gen_random_uuid(),
  deleted_at  timestamptz not null default now(),
  reason      text not null check (public.account_deletion_reason_label(reason) is not null),
  note        text check (char_length(note) between 1 and 180),
  account_age text not null check (
    account_age in ('under_a_day', 'under_a_week', 'under_a_month', 'over_a_month')),
  had_posted  boolean not null
);

alter table public.account_deletion_reasons enable row level security;
alter table public.account_deletions enable row level security;
-- No policies and no grants: only the functions below (running as the owner) touch them.
revoke all on public.account_deletion_reasons, public.account_deletions
  from public, anon, authenticated;

create function public.set_account_deletion_reason(p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_reason is null or p_reason = 'not_given'
     or public.account_deletion_reason_label(p_reason) is null then
    raise exception 'unknown reason' using errcode = '22023';
  end if;

  -- Their own words go with "Something else" only. The same tidy-up as set_bio: control
  -- characters, zero-width and blank fillers and direction marks out, then every kind of space
  -- and line break, in any run, as one space.
  if p_reason = 'other' then
    v_note := regexp_replace(
      coalesce(p_note, ''),
      '[\u0001-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F­͏؜ᅟᅠ឴឵᠋-᠏​‎‏‪-‮⁠-⁤⁦-⁯⠀ㅤ﻿ﾠ]',
      '', 'g');
    v_note := btrim(regexp_replace(
      v_note,
      '[\u0009-\u000D \u0085   -     　]+',
      ' ', 'g'));
    -- Only joiners and selectors left: nothing anyone could read.
    if regexp_replace(v_note, '[ ‌‍︀-️]', '', 'g') = '' then
      v_note := null;
    end if;
    if char_length(v_note) > 180 then
      raise exception 'note is too long: 180 characters at most' using errcode = '22023';
    end if;
  end if;

  insert into public.account_deletion_reasons (user_id, reason, note)
  values (v_uid, p_reason, v_note)
  on conflict (user_id) do update
    set reason = excluded.reason, note = excluded.note, created_at = now();
end;
$$;

-- Runs as the profile row goes, before the reason waiting with it is removed by the cascade.
create function public.record_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_note text;
  v_age interval := now() - old.created_at;
begin
  select r.reason, r.note into v_reason, v_note
  from public.account_deletion_reasons r
  where r.user_id = old.id and r.created_at > now() - interval '1 hour';

  insert into public.account_deletions (reason, note, account_age, had_posted)
  values (
    coalesce(v_reason, 'not_given'),
    v_note,
    case
      when v_age < interval '1 day' then 'under_a_day'
      when v_age < interval '7 days' then 'under_a_week'
      when v_age < interval '30 days' then 'under_a_month'
      else 'over_a_month'
    end,
    old.has_posted_before
  );
  return old;
end;
$$;

create trigger trg_profiles_record_deletion
  before delete on public.profiles
  for each row execute function public.record_account_deletion();

create function public.account_deletion_slack_text(
  p_reason text, p_note text, p_account_age text, p_had_posted boolean
)
returns text
language sql
immutable
set search_path = public
as $$
  select 'Someone deleted their Mahi account.'
    || E'\n• Why: ' || coalesce(public.account_deletion_reason_label(p_reason), 'No reason given')
    || coalesce(
         E'\n• In their words: “'
         || replace(replace(replace(p_note, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '”',
         '')
    || E'\n• Had the account: ' || case p_account_age
         when 'under_a_day' then 'less than a day'
         when 'under_a_week' then 'less than a week'
         when 'under_a_month' then 'less than a month'
         else 'more than a month'
       end
    || E'\n• Posted a workout: ' || case when p_had_posted then 'yes' else 'no' end
$$;

create function public.notify_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'account_deletions_slack_url';
  if v_url is null or v_url !~ '^https://hooks\.slack\.com/' then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'text',
      public.account_deletion_slack_text(new.reason, new.note, new.account_age, new.had_posted)),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- Slack being unreachable or not set up never stops an account from being deleted.
  raise warning 'account deletion not posted to Slack: %', sqlerrm;
  return new;
end;
$$;

create trigger trg_account_deletions_notify
  after insert on public.account_deletions
  for each row execute function public.notify_account_deletion();

create view stats.account_deletions_daily as
select
  (deleted_at at time zone 'UTC')::date as day,
  reason,
  count(*)::int as deletions
from public.account_deletions
group by 1, 2;

revoke all on stats.account_deletions_daily from anon, authenticated;
grant select on stats.account_deletions_daily to posthog_reader;

-- Who may call what: the app leaves a reason; the rest is the server's own.
revoke execute on function public.set_account_deletion_reason(text, text) from public, anon;
grant execute on function public.set_account_deletion_reason(text, text) to authenticated;
revoke execute on function
  public.account_deletion_reason_label(text),
  public.record_account_deletion(),
  public.account_deletion_slack_text(text, text, text, boolean),
  public.notify_account_deletion()
from public, anon, authenticated;

notify pgrst, 'reload schema';
