-- A suspension or ban signs the person out (20261006160000_sign_out_on_ban): their sessions and
-- refresh tokens are deleted; a warning leaves them signed in; others stay signed in.
begin;
select plan(6);

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000e2' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.signed_in(p text) returns int language sql as $$
  select (select count(*)::int from auth.sessions where user_id = pg_temp.uid(p))
       + (select count(*)::int from auth.refresh_tokens where user_id = pg_temp.uid(p)::text)
$$;

insert into auth.users (id, email)
select pg_temp.uid(c), 'so-' || c || '@example.invalid' from unnest(array['a','b','c','x']) c;
insert into public.profiles (id, username)
select pg_temp.uid(c), 'so_test_' || c from unnest(array['a','b','c','x']) c;
insert into public.staff_users (user_id, role) values (pg_temp.uid('x'), 'admin');
insert into auth.sessions (id, user_id)
select gen_random_uuid(), pg_temp.uid(c) from unnest(array['a','b','c']) c;
insert into auth.refresh_tokens (token, user_id, session_id)
select md5(s.id::text), s.user_id::text, s.id from auth.sessions s
where s.user_id in (pg_temp.uid('a'), pg_temp.uid('b'), pg_temp.uid('c'));

select pg_temp.as_user('x');
select public.staff_warn_user(pg_temp.uid('a'), 'Be nice');
select public.staff_suspend_user(pg_temp.uid('b'), 'Spam', 7);
select public.staff_ban_user(pg_temp.uid('c'), 'Hate');
reset role;

select is(pg_temp.signed_in('a'), 2, 'a warning leaves them signed in');
select is(pg_temp.signed_in('b'), 0, 'a suspension signs them out');
select is(pg_temp.signed_in('c'), 0, 'a ban signs them out');
select is(pg_temp.signed_in('x'), 0, 'staff were never signed in here (control)');
select is((select is_banned from public.profiles where id = pg_temp.uid('c')), true,
  'the app shows them the banned screen');
select is((select count(*)::int from public.moderation_actions
           where action = 'ban_user' and target_id = pg_temp.uid('c')), 1, 'the ban is still logged');

select * from finish();
rollback;
