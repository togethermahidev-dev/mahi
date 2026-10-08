-- Staff need a confirmed email (security review, 2026-10-08). 20261006140000_staff_admins gave
-- admin to whichever auth.users rows had the three admin emails, without checking the email was
-- confirmed. This removes any staff row whose account's email is unconfirmed (none on production:
-- the three admins were confirmed on 2026-10-06, checked against the 2026-10-07 backup), and
-- staff_role / is_staff (and so require_staff, my_staff_role and every staff policy) count only
-- accounts with a confirmed email from now on. Otherwise both functions are as live.
-- Test: supabase/tests/staff_confirmed_email_test.sql
-- Undo: supabase/rollbacks/20261008110000_staff_confirmed_email.rollback.sql

delete from public.staff_users s
using auth.users u
where u.id = s.user_id and u.email_confirmed_at is null;

create or replace function public.staff_role(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.role from public.staff_users s
  join auth.users u on u.id = s.user_id and u.email_confirmed_at is not null
  where s.user_id = p_user;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.staff_role(auth.uid()) is not null;
$$;
