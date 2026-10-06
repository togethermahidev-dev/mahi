-- Date of birth and phone number become private (privacy fix, 2026-10-06).
-- Before: "profiles_select_authenticated" lets any signed-in person read every profile row, all
-- columns, so anyone could read everyone's date_of_birth and contact_number (and the app's
-- select('*') on someone else's profile downloaded them).
-- After: the two values live in public.profile_private, which only the person themselves can read
-- (service role bypasses row rules as before). The columns stay on profiles, always empty, so
-- apps already on phones keep working unchanged: sign-up still writes them onto profiles and a
-- trigger moves them across; select('*') still works and simply returns nulls.
-- The person reads their own back with public.my_private_details().
-- Limit: setting either value back to empty through profiles is ignored (the column on profiles is
-- already empty); no app does that today.
-- Test: supabase/tests/private_details_test.sql. Undo: supabase/rollbacks/20261006130000_private_details.rollback.sql

create table public.profile_private (
  id             uuid primary key references auth.users(id) on delete cascade,
  date_of_birth  date,
  contact_number text,
  updated_at     timestamptz not null default now()
);

alter table public.profile_private enable row level security;

create policy profile_private_select_own on public.profile_private
  for select to authenticated using (id = auth.uid());

revoke all on public.profile_private from anon, authenticated;
grant select on public.profile_private to authenticated;

-- Move the two values off every new or edited profile row. Runs as its owner so it can write the
-- private table; it only ever writes the row of the profile being saved, which the row rules on
-- profiles already limit to the person's own.
create function public.profiles_move_private_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.date_of_birth is not null or new.contact_number is not null then
      insert into public.profile_private (id, date_of_birth, contact_number)
      values (new.id, new.date_of_birth, new.contact_number)
      on conflict (id) do update
        set date_of_birth  = coalesce(excluded.date_of_birth, profile_private.date_of_birth),
            contact_number = coalesce(excluded.contact_number, profile_private.contact_number),
            updated_at = now();
    end if;
  else
    if new.date_of_birth is distinct from old.date_of_birth
       or new.contact_number is distinct from old.contact_number then
      insert into public.profile_private (id, date_of_birth, contact_number)
      values (new.id, new.date_of_birth, new.contact_number)
      on conflict (id) do update
        set date_of_birth  = coalesce(excluded.date_of_birth, profile_private.date_of_birth),
            contact_number = coalesce(excluded.contact_number, profile_private.contact_number),
            updated_at = now();
    end if;
  end if;
  new.date_of_birth := null;
  new.contact_number := null;
  return new;
end;
$$;

revoke execute on function public.profiles_move_private_details() from public, anon, authenticated;

create trigger trg_profiles_move_private_details
  before insert or update of date_of_birth, contact_number on public.profiles
  for each row execute function public.profiles_move_private_details();

-- The signed-in person's own details; an empty result for anyone without any.
create function public.my_private_details()
returns table(date_of_birth date, contact_number text)
language sql
stable
security invoker
set search_path = public
as $$
  select p.date_of_birth, p.contact_number from public.profile_private p where p.id = auth.uid();
$$;

revoke execute on function public.my_private_details() from public, anon;
grant execute on function public.my_private_details() to authenticated;

-- Move what is already there, then empty the public columns.
insert into public.profile_private (id, date_of_birth, contact_number)
select id, date_of_birth, contact_number from public.profiles
where date_of_birth is not null or contact_number is not null;

alter table public.profiles disable trigger trg_profiles_updated_at;
update public.profiles set date_of_birth = null, contact_number = null
where date_of_birth is not null or contact_number is not null;
alter table public.profiles enable trigger trg_profiles_updated_at;

notify pgrst, 'reload schema';
