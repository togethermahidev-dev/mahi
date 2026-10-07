-- The sign-up screen asks whether a username is free before the account exists
-- (20261007170000_username_available). Signed-out people still cannot read profiles.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a5e01', 'ua-a@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000a5e01', 'taken_name', 'Europe/London');

select is(has_function_privilege('anon', 'public.username_available(text)', 'execute'),
  true, 'signed out: can ask whether a username is free');
select is(has_function_privilege('authenticated', 'public.username_available(text)', 'execute'),
  true, 'signed in: can ask too');

set local role anon;
select is(public.username_available('taken_name'), false, 'a taken name is not free');
select is(public.username_available('  Taken_Name '), false, 'case and spaces do not hide a taken name');
select is(public.username_available('free_name'), true, 'an unused name is free');
select is(public.username_available(''), false, 'an empty name is never free');
select is((select count(*) from public.profiles)::int, 0, 'signed out: profiles stay unreadable');
reset role;

select * from finish();
rollback;
