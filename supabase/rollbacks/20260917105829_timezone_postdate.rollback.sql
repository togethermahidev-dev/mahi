-- Undo 20260917105829_timezone_postdate. Run in one transaction.
-- Fails on the unique index if two posts now share a UTC day; resolve those first.
begin;

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.posts existing
      where existing.user_id = auth.uid()
        and (existing.created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date
    )
  );

create unique index if not exists posts_user_day_unique
  on public.posts (user_id, ((created_at at time zone 'UTC')::date));
drop index if exists public.posts_user_post_date_unique;

drop trigger if exists posts_set_post_date on public.posts;
drop function if exists public.posts_set_post_date();
alter table public.posts drop column if exists post_date;

drop trigger if exists profiles_validate_timezone on public.profiles;
drop function if exists public.profiles_validate_timezone();
alter table public.profiles drop column if exists timezone;

delete from supabase_migrations.schema_migrations where version = '20260917105829';

commit;
