-- One post per user per LOCAL day, decided by the server.
-- Before: the database counted UTC days while the app counted the phone's local day, so a UK post
-- between 00:00 and 01:00 in summer could be refused. Now each profile has a time zone and the
-- server stamps every post with its local date. Works with current app builds unchanged.
-- Test: supabase/tests/timezone_postdate_test.sql

-- 1. Each user's time zone (the app sets it on sign-in). Only real zone names are accepted.
alter table public.profiles
  add column timezone text not null default 'Europe/London';

create function public.profiles_validate_timezone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_validate_timezone();

-- 2. The post's local date, always set by the server.
alter table public.posts add column post_date date;

update public.posts p
set post_date = (p.created_at at time zone pr.timezone)::date
from public.profiles pr
where pr.id = p.user_id;

alter table public.posts alter column post_date set not null;

-- On insert the server sets created_at and post_date, ignoring anything the client sent.
-- On update both are kept, so a post can never be re-dated.
create function public.posts_set_post_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    select (now() at time zone pr.timezone)::date
      into new.post_date
      from public.profiles pr
     where pr.id = new.user_id;
  else
    new.created_at := old.created_at;
    new.post_date := old.post_date;
  end if;
  return new;
end;
$$;

create trigger posts_set_post_date
  before insert or update on public.posts
  for each row execute function public.posts_set_post_date();

-- 3. The constraint is the rule: one post per user per local day. A lost race fails here.
create unique index posts_user_post_date_unique on public.posts (user_id, post_date);
drop index public.posts_user_day_unique;

-- The old policy repeated the UTC-day check in a racy subquery; the index now enforces it.
drop policy posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert to authenticated
  with check (auth.uid() = user_id);
