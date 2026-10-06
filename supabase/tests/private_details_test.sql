-- Date of birth and phone number are private (20261006130000_private_details): only the person
-- themselves reads them back. Other signed-in people see the profile without them, and apps
-- already on phones that write or read them on profiles keep working.
-- Every check reads only this test's own people, so it also runs on a database with history.
begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0b0a', 'priv-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000d0b0b', 'priv-b@example.invalid');

-- A signs up the way every app does: details written straight onto profiles.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000d0b0a","role":"authenticated"}';
select lives_ok(
  $$insert into public.profiles (id, username, date_of_birth, contact_number)
    values ('00000000-0000-0000-0000-0000000d0b0a', 'priv_a', '1990-02-03', '+447700900001')$$,
  'sign-up with a date of birth and phone number still works');
select is((select date_of_birth from public.profiles where id = auth.uid()), null,
  'the date of birth is not kept on the public profile');
select is((select contact_number from public.profiles where id = auth.uid()), null,
  'nor the phone number');
select is((select date_of_birth from public.my_private_details()), '1990-02-03'::date,
  'A reads back her own date of birth');
select is((select contact_number from public.my_private_details()), '+447700900001',
  'and her own phone number');

select lives_ok(
  $$update public.profiles set contact_number = '+447700900002' where id = auth.uid()$$,
  'editing the phone number on profiles still works');
select is((select contact_number from public.my_private_details()), '+447700900002',
  'and the new number is the one kept');
select is((select date_of_birth from public.my_private_details()), '1990-02-03'::date,
  'an edit that leaves the date of birth out keeps it');

-- B, another signed-in person.
reset role;
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000d0b0b', 'priv_b');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000d0b0b","role":"authenticated"}';
select is((select count(*) from public.profiles
           where id = '00000000-0000-0000-0000-0000000d0b0a'
             and (date_of_birth is not null or contact_number is not null))::int, 0,
  'B cannot read A''s date of birth or phone number on profiles');
select is((select count(*) from public.profile_private
           where id = '00000000-0000-0000-0000-0000000d0b0a')::int, 0,
  'nor in the private table');
select is((select count(*) from public.my_private_details())::int, 0,
  'B''s own private details are empty, never A''s');
select throws_ok($$insert into public.profile_private (id, date_of_birth)
                   values ('00000000-0000-0000-0000-0000000d0b0a', '2000-01-01')$$,
  '42501', null, 'and B cannot write A''s private details');

reset role;
select ok(not has_table_privilege('anon', 'public.profile_private', 'SELECT'),
  'signed-out visitors have no access at all');

select * from finish();
rollback;
