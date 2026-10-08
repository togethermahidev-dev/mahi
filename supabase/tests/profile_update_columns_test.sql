-- Only the server changes a profile's streak, ban, username and id. The app may change its own
-- details, photo and time zone, and nothing else (column grants; the row rules are unchanged).
begin;
select plan(16);

update public.app_config set tags_required = false;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c01a', 'cols-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000c01b', 'cols-b@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-00000000c01a', 'cols_a', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000c01b', 'cols_b', 'Europe/London');
insert into storage.objects (bucket_id, name) values ('posts', '00000000-0000-0000-0000-00000000c01a/1.jpg');
-- B tags A, so A's post moves the streak.
insert into public.tag_challenges (tagger_id, tagged_id, expires_at) values
  ('00000000-0000-0000-0000-00000000c01b', '00000000-0000-0000-0000-00000000c01a', now() + interval '48 hours');

select ok(not has_column_privilege('authenticated', 'public.profiles', 'streak_current', 'UPDATE'),
  'the app has no right to update streak_current');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'is_banned', 'UPDATE'),
  'nor is_banned');
select ok(has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE'),
  'it may update avatar_url');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c01a","role":"authenticated"}';

select throws_ok($$update public.profiles set streak_current = 99 where id = auth.uid()$$,
  '42501', null, 'you cannot set your own streak');
select throws_ok($$update public.profiles set streak_highest = 99 where id = auth.uid()$$,
  '42501', null, 'nor your highest streak');
select throws_ok($$update public.profiles set is_banned = false where id = auth.uid()$$,
  '42501', null, 'nor your ban');
select throws_ok($$update public.profiles set username = 'cols_c' where id = auth.uid()$$,
  '42501', null, 'nor your username');
select throws_ok($$update public.profiles set id = '00000000-0000-0000-0000-00000000c01c' where id = auth.uid()$$,
  '42501', null, 'nor your id');

select lives_ok($$update public.profiles set avatar_url = 'https://pzepodsppqtvptzmwxzs.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-00000000c01a/avatar.jpg'
                  where id = auth.uid()$$,
  'you can change your photo (an address in your own avatar folder, 20261008140000)');
select lives_ok($$update public.profiles set timezone = 'America/New_York' where id = auth.uid()$$,
  'and your time zone');
select lives_ok(
  $$update public.profiles
    set display_name = 'A', first_name = 'A', last_name = 'B', date_of_birth = '2000-01-01',
        contact_number = '1', fitness_goals = array['run']
    where id = auth.uid()$$,
  'and your details');

-- Row rules are as before: someone else's row is simply not yours to change.
update public.profiles set avatar_url = 'https://pzepodsppqtvptzmwxzs.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-00000000c01b/avatar.jpg'
  where id = '00000000-0000-0000-0000-00000000c01b';
select is((select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000c01b'), null,
  'another person''s profile stays as it was');

-- The server still moves the streak: create_post runs as its owner, not as you.
select is(
  (public.create_post('66666666-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-00000000c01a/1.jpg', null, null, '{}'::uuid[]) -> 'streak' ->> 'streak_current')::int,
  1, 'a post that answers a tag still adds 1 to the streak');
reset role;

select is((select streak_current from public.profiles where id = '00000000-0000-0000-0000-00000000c01a'), 1,
  'the streak is saved');
select is((select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000c01a'),
  'https://pzepodsppqtvptzmwxzs.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-00000000c01a/avatar.jpg',
  'the photo change is saved');
select is((select timezone from public.profiles where id = '00000000-0000-0000-0000-00000000c01a'), 'America/New_York',
  'the time zone change is saved');

select * from finish();
rollback;
