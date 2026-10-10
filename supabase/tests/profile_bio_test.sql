-- A profile's bio, and follower / following counts that stop at a block
-- (20261010110000_profile_bio; owner, 2026-10-10: "Should this be added- yes").
-- * the bio is kept in profile_bios, which the app can neither read nor write: every signed-in
--   person can read the whole profiles row, blocked or not, so a column there could not be hidden
-- * set_bio is the only way to change it: your own only, trimmed, line breaks and runs of spaces
--   become one space, invisible characters go, empty means none, more than 150 is refused, and a
--   banned or suspended account is refused
-- * get_profile_about returns it to anyone signed in who may see the profile's name (a private
--   account's name shows to everyone, so its bio does too), never across a block, never for a
--   banned account
-- * get_follow_data keeps its counts back across a block
-- Every check reads only this test's own people, as a stranger with a fresh account would call it.
begin;
select plan(60);

update public.app_config set feed_lock_enabled = false;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-000000b10a' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.signed_out() returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', '{}', true);
$$;
create function pg_temp.stored(p text) returns text language sql as $$
  select bio from public.profile_bios where id = pg_temp.uid(p)
$$;

-- o is public; p is private and f follows p; s is a stranger with a fresh account; o blocked b;
-- k blocked o; z gets banned.
insert into auth.users (id, email)
select pg_temp.uid(c), 'bio-' || c || '@example.invalid'
from unnest(array['o','p','f','s','b','k','z']) c;
insert into public.profiles (id, username, is_private)
select pg_temp.uid(c), 'bio_' || c, c = 'p'
from unnest(array['o','p','f','s','b','k','z']) c;
insert into public.follows (follower_id, following_id) values
  (pg_temp.uid('f'), pg_temp.uid('p')),
  (pg_temp.uid('f'), pg_temp.uid('o')),
  (pg_temp.uid('s'), pg_temp.uid('o')),
  (pg_temp.uid('o'), pg_temp.uid('f'));
insert into public.user_blocks (blocker_id, blocked_id) values
  (pg_temp.uid('o'), pg_temp.uid('b')),
  (pg_temp.uid('k'), pg_temp.uid('o'));

-- 1. Where it is kept, and who may call what.
select hasnt_column('public', 'profiles', 'bio',
  'the bio is not on profiles, whose whole row every signed-in person can read');
select ok(not has_table_privilege('authenticated', 'public.profile_bios', 'SELECT')
          and not has_table_privilege('authenticated', 'public.profile_bios', 'INSERT')
          and not has_table_privilege('authenticated', 'public.profile_bios', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.profile_bios', 'DELETE'),
  'the app can neither read nor write the bio table');
select ok(not has_table_privilege('anon', 'public.profile_bios', 'SELECT')
          and not has_table_privilege('anon', 'public.profile_bios', 'INSERT'),
  'nor can a signed-out visitor');
select ok((select relrowsecurity from pg_class where oid = 'public.profile_bios'::regclass),
  'row level security is on');
select ok(has_function_privilege('authenticated', 'public.set_bio(text)', 'execute')
          and not has_function_privilege('anon', 'public.set_bio(text)', 'execute')
          and not has_function_privilege('public', 'public.set_bio(text)', 'execute'),
  'set_bio: signed-in only');
select ok(has_function_privilege('authenticated', 'public.get_profile_about(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.get_profile_about(uuid)', 'execute')
          and not has_function_privilege('public', 'public.get_profile_about(uuid)', 'execute'),
  'get_profile_about: signed-in only');
select is((select string_agg(pg_get_function_identity_arguments(oid), ' | ')
           from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_bio'),
  'p_bio text', 'set_bio takes the words only: there is no user id to pass');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=public'])
           from pg_proc where pronamespace = 'public'::regnamespace
             and proname in ('set_bio', 'get_profile_about')),
  'both run as their owner with a fixed search path');

-- 2. Signed out is refused.
select pg_temp.signed_out();
select throws_ok($$select public.set_bio('hello')$$, '42501', 'not signed in',
  'signed out: no bio can be set');
select throws_ok($$select public.get_profile_about(pg_temp.uid('o'))$$, '42501', 'not signed in',
  'signed out: no bio can be read');
reset role;
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select public.set_bio('hello')$$, '42501', null,
  'the signed-out role cannot call set_bio at all');
select throws_ok($$select public.get_profile_about('00000000-0000-0000-0000-000000b10a15')$$,
  '42501', null, 'nor get_profile_about');
reset role;

-- 3. Saving: trimmed, and line breaks and runs of spaces become one space.
select pg_temp.as_user('o');
select is(public.set_bio(E'  Lifting   heavy\n\nthings\t every \r\n day  ') ->> 'bio',
  'Lifting heavy things every day', 'the saved bio comes back trimmed, on one line');
reset role;
select is(pg_temp.stored('o'), 'Lifting heavy things every day', 'and that is what is kept');

select pg_temp.as_user('o');
select is(public.set_bio('a' || U&'\00A0' || U&'\2028' || U&'\3000' || 'b') ->> 'bio', 'a b',
  'other kinds of space and line break collapse too');
select is(public.set_bio('a' || U&'\200B' || U&'\202E' || U&'\FEFF' || chr(7) || 'b') ->> 'bio', 'ab',
  'invisible and direction-flipping characters are taken out');
select is(public.set_bio(U&'Lift \+01F3CB\FE0F\200D\2640\FE0F') ->> 'bio',
  U&'Lift \+01F3CB\FE0F\200D\2640\FE0F', 'an emoji made of joined parts is kept whole');

-- 4. Length: 150 characters at most, counted after tidying; an emoji counts once.
select is(char_length(public.set_bio(repeat('a', 150)) ->> 'bio'), 150, '150 characters are saved');
select is(char_length(public.set_bio('   ' || repeat('b', 150) || E' \n ') ->> 'bio'), 150,
  'spaces around it do not count');
select is(char_length(public.set_bio(repeat(U&'\+01F4AA', 150)) ->> 'bio'), 150,
  '150 emoji are saved');
select throws_ok($$select public.set_bio(repeat('c', 151))$$, '22023',
  'bio is too long: 150 characters at most', '151 characters are refused, with the reason');
select throws_ok($$select public.set_bio(repeat(U&'\+01F4AA', 151))$$, '22023', null,
  '151 emoji are refused');
reset role;
select is(pg_temp.stored('o'), repeat(U&'\+01F4AA', 150), 'a refused bio leaves the old one in place');

-- 5. Empty means none.
select pg_temp.as_user('o');
select ok(public.set_bio(E'  \n\t ') -> 'bio' = 'null'::jsonb, 'only spaces: no bio');
reset role;
select is((select count(*)::int from public.profile_bios where id = pg_temp.uid('o')), 0,
  'and nothing is kept');
select pg_temp.as_user('o');
select ok(public.set_bio(U&'\200B\200D\FE0F \3164') -> 'bio' = 'null'::jsonb,
  'only invisible characters: no bio');
select ok(public.set_bio(null) -> 'bio' = 'null'::jsonb, 'nothing passed: no bio');
select is(public.set_bio('Up at 5, lifting by 6') ->> 'bio', 'Up at 5, lifting by 6',
  'o writes a bio again');
reset role;

-- 6. A stranger with a fresh account can only ever change their own.
select pg_temp.as_user('s');
select is(public.set_bio('I am s') ->> 'bio', 'I am s', 'a stranger sets a bio');
reset role;
select is(pg_temp.stored('s'), 'I am s', 'it lands on their own profile');
select is(pg_temp.stored('o'), 'Up at 5, lifting by 6', 'and nobody else''s changed');
select pg_temp.as_user('s');
select throws_ok(
  $$insert into public.profile_bios (id, bio) values (pg_temp.uid('b'), 'written straight in')$$,
  '42501', null, 'a stranger cannot write a bio row directly');
select throws_ok(
  $$update public.profile_bios set bio = 'taken over' where id = pg_temp.uid('o')$$,
  '42501', null, 'nor change someone else''s');
select throws_ok(
  $$update public.profile_bios set bio = 'my own, the long way round' where id = pg_temp.uid('s')$$,
  '42501', null, 'nor even their own, except through set_bio');
select throws_ok($$delete from public.profile_bios where id = pg_temp.uid('o')$$,
  '42501', null, 'nor delete one');
select throws_ok($$select bio from public.profile_bios$$,
  '42501', null, 'nor read the table');
select throws_ok($$update public.profiles set bio = 'x' where id = pg_temp.uid('s')$$,
  '42703', null, 'and profiles has no bio to write');
reset role;

-- 7. Reading: anyone signed in who may see the name sees the bio.
select pg_temp.as_user('o');
select is(public.get_profile_about(pg_temp.uid('o')) ->> 'bio', 'Up at 5, lifting by 6',
  'o reads their own bio');
select is((public.get_profile_about(pg_temp.uid('o')) ->> 'lists_open')::boolean, true,
  'and their own lists are always open to them');
reset role;
select pg_temp.as_user('s');
select is(public.get_profile_about(pg_temp.uid('o')) ->> 'bio', 'Up at 5, lifting by 6',
  'a stranger reads a public account''s bio');
select ok(public.get_profile_about(pg_temp.uid('f')) -> 'bio' = 'null'::jsonb,
  'someone with no bio: none comes back');
select ok(public.get_profile_about('00000000-0000-0000-0000-000000b10a99') -> 'bio' = 'null'::jsonb,
  'an id that is nobody: the same empty answer, no error');
reset role;

-- A private account: its name shows to everyone signed in, so its bio does too; its lists do not.
select pg_temp.as_user('p');
select is(public.set_bio('Private runner') ->> 'bio', 'Private runner', 'p (private) sets a bio');
reset role;
select pg_temp.as_user('s');
select is((select username from public.profiles where id = pg_temp.uid('p')), 'bio_p',
  'a non-follower reads a private account''s name');
select is(public.get_profile_about(pg_temp.uid('p')) ->> 'bio', 'Private runner',
  'and its bio, exactly as its name');
select is((public.get_profile_about(pg_temp.uid('p')) ->> 'lists_open')::boolean, false,
  'but its follower and following lists stay closed to a non-follower');
reset role;
select pg_temp.as_user('f');
select ok((public.get_profile_about(pg_temp.uid('p')) ->> 'lists_open')::boolean
          and public.can_see_follow_lists(pg_temp.uid('p')),
  'an approved follower may open them: lists_open is the list rule (can_see_follow_lists)');
reset role;

-- 8. Never across a block, either way round.
select pg_temp.as_user('b');
select ok(public.get_profile_about(pg_temp.uid('o')) = '{"bio": null, "lists_open": false}'::jsonb,
  'someone o blocked gets no bio and no lists');
select ok((select follower_count is null and following_count is null
           from public.get_follow_data(null, pg_temp.uid('o'))),
  'and no follower or following counts');
select is((select count(*)::int from public.get_follow_data(null, pg_temp.uid('o'))), 1,
  'the follow read still answers with one row');
reset role;
select pg_temp.as_user('o');
select ok(public.get_profile_about(pg_temp.uid('k')) = '{"bio": null, "lists_open": false}'::jsonb,
  'and o gets nothing of someone who blocked o');
reset role;
select pg_temp.as_user('k');
select ok(public.get_profile_about(pg_temp.uid('o')) -> 'bio' = 'null'::jsonb,
  'nor does the person who did the blocking');
select ok((select follower_count is null from public.get_follow_data(null, pg_temp.uid('o'))),
  'nor the counts');
reset role;

-- The counts for everyone else, and your own.
select pg_temp.as_user('s');
select is((select (follower_count::int, following_count::int)::text
           from public.get_follow_data(null, pg_temp.uid('o'))), '(2,1)',
  'a stranger still gets the counts of a profile they can see');
reset role;

-- 9. A banned or suspended account: cannot write, and its bio is not shown to others.
select pg_temp.as_user('z');
select is(public.set_bio('Buy followers at example.invalid') ->> 'bio',
  'Buy followers at example.invalid', 'z writes a bio');
reset role;
update public.profiles set is_banned = true where id = pg_temp.uid('z');
select pg_temp.as_user('z');
select throws_ok($$select public.set_bio('still here')$$, '42501', 'not allowed',
  'a banned account cannot change its bio');
reset role;
select pg_temp.as_user('s');
select ok(public.get_profile_about(pg_temp.uid('z')) -> 'bio' = 'null'::jsonb,
  'and its bio is not shown to anyone else');
reset role;

-- 10. The table itself holds the limit, and a deleted account takes its bio with it.
select throws_ok(
  $$insert into public.profile_bios (id, bio) values (pg_temp.uid('b'), repeat('x', 151))$$,
  '23514', null, 'the table refuses more than 150 characters, whoever writes');
select throws_ok(
  $$insert into public.profile_bios (id, bio) values (pg_temp.uid('b'), '')$$,
  '23514', null, 'and an empty bio row (none is no row)');
delete from auth.users where id = pg_temp.uid('s');
select is((select count(*)::int from public.profile_bios where id = pg_temp.uid('s')), 0,
  'deleting the account deletes its bio');

select * from finish();
rollback;
