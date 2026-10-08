-- Undo 20261008110000_staff_confirmed_email: staff_role and is_staff stop checking that the
-- email is confirmed (bodies as live on 2026-10-07). Staff rows the migration removed are not
-- restored (there were none on production); re-add one with an insert into public.staff_users.
begin;

create or replace function public.staff_role(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.staff_users where user_id = p_user;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (select 1 from public.staff_users where user_id = auth.uid());
$$;

delete from supabase_migrations.schema_migrations where version = '20261008110000';

commit;
