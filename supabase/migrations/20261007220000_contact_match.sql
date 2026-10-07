-- Find your mates from your contacts (owner, 2026-10-07: "bring Mahi up to speed with Lapse /
-- BeReal / Locket"). The phone never uploads its contacts: it writes each number as E.164 and each
-- email in lower case, hashes them with SHA-256, and sends only the hashes. The server compares
-- them with hashes of each account's own private number (profile_private) and sign-in email
-- (auth.users), and answers with the accounts found: id, username, name, photo and follow state.
-- No phone number or email ever comes back, and the hashes table can't be read from the app.
--   * normalise_phone / contact_hash: the one way to write a number and the one hash, the same as
--     the app's (ui/src/lib/contactMatch.ts). Numbers with no country code are taken as UK (+44).
--   * contact_hashes: one hash per account per kind (phone, email). Kept in step by triggers on
--     profile_private (the number) and profiles (the email, read at sign-up). There is no trigger on
--     auth.users, so sign-in never depends on this: an email changed later is checked against
--     auth.users at match time, so an old address never finds anyone.
--   * match_contacts(p_hashes): signed in, not banned, at most contact_match_max_hashes (2000) a
--     call and contact_match_calls_per_hour (10) calls an hour. Leaves out yourself, banned
--     accounts and anyone blocked either way.
-- Test: supabase/tests/contact_match_test.sql
-- Undo: supabase/rollbacks/20261007220000_contact_match.rollback.sql

-- 1. Settings. Changing one is a one-line migration: update public.app_config set ... ;
alter table public.app_config
  add column contact_match_max_hashes int not null default 2000
    constraint app_config_contact_match_max_hashes_positive check (contact_match_max_hashes > 0),
  add column contact_match_calls_per_hour int not null default 10
    constraint app_config_contact_match_calls_positive check (contact_match_calls_per_hour > 0);

-- 2. One way to write a phone number: +<country><number>, digits only, 8 to 15 of them; null for
--    anything that isn't a number. A number with no country code is taken as p_default_cc's.
create function public.normalise_phone(p_raw text, p_default_cc text default '44')
returns text
language sql
immutable
set search_path = public
as $$
  select case when e ~ '^\+[1-9][0-9]{7,14}$' then e end
  from (
    select case
             when e0 like '+' || p_default_cc || '0%' then '+' || p_default_cc || substr(e0, length(p_default_cc) + 3)
             else e0
           end as e
    from (
      select case
               when raw like '+%' then '+' || d
               when d like '00%' then '+' || substr(d, 3)
               when d like '0%' then '+' || p_default_cc || substr(d, 2)
               when length(d) <= 10 then '+' || p_default_cc || d
               else '+' || d
             end as e0
      from (
        select btrim(coalesce(p_raw, '')) as raw,
               regexp_replace(replace(coalesce(p_raw, ''), '(0)', ''), '[^0-9]', '', 'g') as d
      ) s
    ) x
  ) y;
$$;

-- SHA-256 of the text, lower-case hex.
create function public.contact_hash(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(p_value, 'UTF8')), 'hex');
$$;

-- 3. The hashes. Only the functions below read or write them.
create table public.contact_hashes (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null constraint contact_hashes_kind check (kind in ('phone', 'email')),
  hash text not null,
  primary key (user_id, kind)
);
create index contact_hashes_hash_idx on public.contact_hashes (hash);
alter table public.contact_hashes enable row level security;
revoke all on public.contact_hashes from public, anon, authenticated;

-- Tries, for the hourly limit. Only match_contacts reads or writes them.
create table public.contact_match_calls (
  user_id uuid not null references auth.users(id) on delete cascade,
  called_at timestamptz not null default now()
);
create index contact_match_calls_user_idx on public.contact_match_calls (user_id, called_at);
alter table public.contact_match_calls enable row level security;
revoke all on public.contact_match_calls from public, anon, authenticated;

-- 4. One person's hashes, rewritten from their private number and their sign-in email.
create function public.refresh_contact_hashes(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_email text;
begin
  select public.normalise_phone(contact_number) into v_phone
  from public.profile_private where id = p_user;
  select lower(btrim(email)) into v_email from auth.users where id = p_user;

  delete from public.contact_hashes where user_id = p_user;
  if v_phone is not null then
    insert into public.contact_hashes (user_id, kind, hash)
    values (p_user, 'phone', public.contact_hash(v_phone));
  end if;
  if v_email like '%_@_%' then
    insert into public.contact_hashes (user_id, kind, hash)
    values (p_user, 'email', public.contact_hash(v_email));
  end if;
end;
$$;

create function public.contact_hashes_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_contact_hashes(new.id);
  return null;
end;
$$;

create trigger trg_profile_private_contact_hashes
  after insert or update of contact_number on public.profile_private
  for each row execute function public.contact_hashes_sync();

create trigger trg_profiles_contact_hashes
  after insert on public.profiles
  for each row execute function public.contact_hashes_sync();

-- 5. Everyone already here.
insert into public.contact_hashes (user_id, kind, hash)
select pp.id, 'phone', public.contact_hash(public.normalise_phone(pp.contact_number))
from public.profile_private pp
join auth.users u on u.id = pp.id
where public.normalise_phone(pp.contact_number) is not null
on conflict do nothing;

insert into public.contact_hashes (user_id, kind, hash)
select u.id, 'email', public.contact_hash(lower(btrim(u.email)))
from auth.users u
join public.profiles p on p.id = u.id
where lower(btrim(u.email)) like '%_@_%'
on conflict do nothing;

-- 6. Who among your contacts is on Mahi.
create function public.match_contacts(p_hashes text[])
returns table (
  id uuid, username text, display_name text, avatar_url text,
  is_following boolean, follows_you boolean, matched_hashes text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  -- Serialises this person's tries, so two at once can't both slip under the limit.
  perform 1 from public.profiles pr where pr.id = v_uid and not pr.is_banned for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_hashes), 0) > v_cfg.contact_match_max_hashes then
    raise exception 'contact match: too many hashes' using errcode = '22023';
  end if;

  delete from public.contact_match_calls c
  where c.user_id = v_uid and c.called_at <= now() - interval '1 hour';
  if (select count(*) from public.contact_match_calls c where c.user_id = v_uid)
     >= v_cfg.contact_match_calls_per_hour then
    raise exception 'contact match: too many tries' using errcode = '22023';
  end if;
  insert into public.contact_match_calls (user_id) values (v_uid);

  return query
  with sent as (
    select distinct h from unnest(p_hashes) as t(h) where h ~ '^[0-9a-f]{64}$'
  ),
  hits as (
    select ch.user_id, array_agg(ch.hash order by ch.hash) as hashes
    from public.contact_hashes ch
    join sent on sent.h = ch.hash
    left join auth.users u on u.id = ch.user_id
    -- An email hash counts only while it is still that account's email.
    where ch.kind = 'phone'
       or public.contact_hash(lower(btrim(u.email))) = ch.hash
    group by ch.user_id
  )
  select p.id, p.username, p.display_name, p.avatar_url,
         exists (select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p.id),
         exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = v_uid),
         hits.hashes
  from hits
  join public.profiles p on p.id = hits.user_id and not p.is_banned
  where p.id <> v_uid
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = v_uid))
  order by p.username;
end;
$$;

-- 7. Who may call what.
revoke execute on function
  public.refresh_contact_hashes(uuid),
  public.contact_hashes_sync(),
  public.match_contacts(text[])
from public, anon, authenticated;

grant execute on function public.match_contacts(text[]) to authenticated;

notify pgrst, 'reload schema';
