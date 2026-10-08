-- Staff need a confirmed email (20261008110000_staff_confirmed_email): 20261006140000_staff_admins
-- matched admin accounts by email alone. A staff_users row for an unconfirmed account gives no
-- staff rights, and the migration removed any such row; confirmed staff keep theirs.
begin;
select plan(8);

select is((select count(*)::int from public.staff_users s join auth.users u on u.id = s.user_id
           where u.email_confirmed_at is null), 0,
  'no staff row belongs to an account with an unconfirmed email');

-- x: confirmed admin; y: admin row but the email was never confirmed.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000f6a1', 'staff-ok@example.invalid', now()),
  ('00000000-0000-0000-0000-00000000f6a2', 'staff-unconfirmed@example.invalid', null);
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-00000000f6a1', 'staff_ok'),
  ('00000000-0000-0000-0000-00000000f6a2', 'staff_unconfirmed');
insert into public.staff_users (user_id, role) values
  ('00000000-0000-0000-0000-00000000f6a1', 'admin'),
  ('00000000-0000-0000-0000-00000000f6a2', 'admin');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

select is(public.staff_role('00000000-0000-0000-0000-00000000f6a2'), null,
  'an unconfirmed account has no staff role');
select is(public.staff_role('00000000-0000-0000-0000-00000000f6a1'), 'admin',
  'a confirmed admin keeps theirs');

select pg_temp.as_user('00000000-0000-0000-0000-00000000f6a2');
select is(public.is_staff(), false, 'unconfirmed: not staff');
select is(public.my_staff_role(), null, 'unconfirmed: the portal sees no role');
reset role;
-- require_staff is internal (staff actions call it as their owner), so it runs here as the owner
-- with the caller's claims.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f6a2"}', true);
select throws_ok('select public.require_staff()', '42501', 'staff only', 'unconfirmed: staff actions refused');

select pg_temp.as_user('00000000-0000-0000-0000-00000000f6a1');
select is(public.is_staff(), true, 'confirmed admin: staff');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f6a1"}', true);
select is(public.require_staff(true), '00000000-0000-0000-0000-00000000f6a1'::uuid,
  'confirmed admin: admin actions allowed');

select * from finish();
rollback;
