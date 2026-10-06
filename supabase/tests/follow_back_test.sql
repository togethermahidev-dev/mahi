-- Follow back (20261006110000_follow_back): get_follow_data also says whether they follow you,
-- and keeps its first three answers.
-- b follows a; a follows c; c and a follow each other.
begin;
select plan(7);

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000fb' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'fb-' || c || '@example.invalid' from unnest(array['a','b','c']) c;
insert into public.profiles (id, username)
select pg_temp.uid(c), 'fb_test_' || c from unnest(array['a','b','c']) c;
insert into public.follows (follower_id, following_id) values
  (pg_temp.uid('b'), pg_temp.uid('a')),
  (pg_temp.uid('a'), pg_temp.uid('c')),
  (pg_temp.uid('c'), pg_temp.uid('a'));

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
         json_build_object('sub', pg_temp.uid('a'), 'role', 'authenticated')::text, true);

select is(
  (select row(is_following, follower_count, following_count)::text
   from public.get_follow_data(pg_temp.uid('a'), pg_temp.uid('b'))),
  '(f,0,1)', 'the first three answers are as before');
select is((select follows_you from public.get_follow_data(pg_temp.uid('a'), pg_temp.uid('b'))), true,
  'b follows a but a does not follow b: follows_you, so the app can say "Follow back"');
select is((select is_following from public.get_follow_data(pg_temp.uid('a'), pg_temp.uid('c'))), true,
  'a follows c');
select is((select follows_you from public.get_follow_data(pg_temp.uid('a'), pg_temp.uid('c'))), true,
  'and c follows a: friends');
select is((select follows_you from public.get_follow_data(pg_temp.uid('b'), pg_temp.uid('c'))), false,
  'c does not follow b');
select is((select follows_you from public.get_follow_data(pg_temp.uid('a'), pg_temp.uid('a'))), false,
  'your own profile never says you follow yourself');
select is((select count(*)::int from public.get_follow_data(pg_temp.uid('a'), pg_temp.uid('b'))), 1,
  'still one row');

select * from finish();
rollback;
