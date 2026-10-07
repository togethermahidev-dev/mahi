-- Sign-up asks whether a username is free before the account exists. Since
-- 20261006170000_signed_in_reads a signed-out person cannot read profiles, so the old direct
-- lookup always came back empty and every name showed "Available". This answers yes or no only:
-- no profile data leaves the database.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(lower(trim(p_username)), '') is not null
     and not exists (
       select 1 from public.profiles where username = lower(trim(p_username))
     );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
