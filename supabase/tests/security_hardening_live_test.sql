-- Gaps found by the live Supabase check (20261008150000_security_hardening_live):
-- * follows change only through set_following (and the definer functions); no direct writes;
--   no follow notification across a block or from a banned person
-- * avatar_url points only at your own folder of the avatars bucket
-- * avatar files: you can list only your own (the bucket stays public, so image links work)
-- * get_message_reactions / react_to_message: signed-in only
-- * anon has no table rights in public; authenticated has no truncate / references / trigger
-- * reports only through report_* (no direct insert); the own-report count still works
-- * answered_by_post / post_invites are internal
begin;
select plan(41);

update public.app_config set feed_lock_enabled = false, tags_required = false;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000005ecf' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.avatar(p text) returns text language sql immutable as $$
  select 'https://pzepodsppqtvptzmwxzs.supabase.co/storage/v1/object/public/avatars/'
         || pg_temp.uid(p)::text || '/avatar.jpg'
$$;
create function pg_temp.follow_notes(p_to text, p_from text) returns int language sql as $$
  select count(*)::int from public.notifications
  where user_id = pg_temp.uid(p_to) and actor_id = pg_temp.uid(p_from) and type = 'follow'
$$;

-- a posts; b follows a; c is someone new; d blocked b; e is banned.
insert into auth.users (id, email)
select pg_temp.uid(c), 'live-' || c || '@example.invalid' from unnest(array['a','b','c','d','e']) c;
insert into public.profiles (id, username, is_banned)
select pg_temp.uid(c), 'live_' || c, c = 'e' from unnest(array['a','b','c','d','e']) c;
insert into public.follows (follower_id, following_id) values (pg_temp.uid('b'), pg_temp.uid('a'));
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('d'), pg_temp.uid('b'));
insert into public.posts (id, user_id, image_url, image_path, streak_day)
values ('00000000-0000-0000-0000-0000005ecf91', pg_temp.uid('a'), 'x',
        pg_temp.uid('a')::text || '/p.jpg', 1);
insert into storage.objects (bucket_id, name) values
  ('avatars', pg_temp.uid('a')::text || '/avatar.jpg'),
  ('avatars', pg_temp.uid('b')::text || '/avatar.jpg');

-- 1. Follows.
select pg_temp.as_user('b');
select throws_ok($$insert into public.follows (follower_id, following_id)
                   values (pg_temp.uid('b'), pg_temp.uid('c'))$$,
  '42501', null, 'a direct follow is refused');
select throws_ok($$delete from public.follows where follower_id = pg_temp.uid('b')$$,
  '42501', null, 'a direct unfollow is refused');
select throws_ok($$update public.follows set created_at = now() where follower_id = pg_temp.uid('b')$$,
  '42501', null, 'a direct change is refused');
select is((select is_following from public.set_following(pg_temp.uid('c'), true)), true,
  'set_following still follows');
reset role;
select is(pg_temp.follow_notes('c', 'b'), 1, 'and the person followed is told');
select pg_temp.as_user('b');
select is((select is_following from public.set_following(pg_temp.uid('c'), false)), false,
  'set_following still unfollows');
select throws_ok($$select * from public.set_following(pg_temp.uid('d'), true)$$,
  '22023', 'cannot follow that person', 'no follow across a block');
reset role;
-- Rows written by the server (as a definer function would) skip the notice across a block or
-- from a banned person.
insert into public.follows (follower_id, following_id) values (pg_temp.uid('b'), pg_temp.uid('d'));
select is(pg_temp.follow_notes('d', 'b'), 0, 'no follow notice across a block');
insert into public.follows (follower_id, following_id) values (pg_temp.uid('e'), pg_temp.uid('a'));
select is(pg_temp.follow_notes('a', 'e'), 0, 'no follow notice from a banned person');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'follows'
                      and cmd in ('INSERT', 'DELETE')),
  'the old insert and delete rules are gone');

-- 2. Avatar address.
select pg_temp.as_user('b');
select lives_ok(format($$update public.profiles set avatar_url = %L where id = auth.uid()$$,
                       pg_temp.avatar('b')),
  'your own avatar file is fine');
select lives_ok($$update public.profiles set avatar_url = null where id = auth.uid()$$,
  'no avatar is fine');
select throws_ok($$update public.profiles set avatar_url = 'https://evil.example/me.jpg' where id = auth.uid()$$,
  '23514', null, 'an address somewhere else is refused');
select throws_ok(format($$update public.profiles set avatar_url = %L where id = auth.uid()$$,
                        pg_temp.avatar('a')),
  '23514', null, 'someone else''s avatar file is refused');
select throws_ok(format($$update public.profiles set avatar_url = %L where id = auth.uid()$$,
                        replace(pg_temp.avatar('b'), 'https://pzepodsppqtvptzmwxzs.supabase.co',
                                'https://evil.example')),
  '23514', null, 'the right path on another host is refused');
select throws_ok(format($$update public.profiles set avatar_url = %L where id = auth.uid()$$,
                        replace(pg_temp.avatar('b'), '/avatar.jpg',
                                '/../' || pg_temp.uid('a')::text || '/avatar.jpg')),
  '23514', null, 'climbing out of your folder is refused');
select throws_ok(format($$update public.profiles set avatar_url = %L where id = auth.uid()$$,
                        replace(pg_temp.avatar('b'), 'https://', 'http://')),
  '23514', null, 'a plain http address is refused');
reset role;

-- 3. Avatar files.
select is((select public from storage.buckets where id = 'avatars'), true,
  'the avatars bucket stays public (image links keep working)');
select ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                      and policyname = 'Public read access for avatars'),
  'the read-everything rule is gone');
select pg_temp.as_user('b');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 1,
  'you can list only your own avatar file');
select is((select string_agg(name, ',' order by name) from storage.objects where bucket_id = 'avatars'),
  pg_temp.uid('b')::text || '/avatar.jpg', 'and it is yours');
-- Replacing a file (the app's upsert) updates the existing row, which needs it to be visible to you.
-- (Production's storage.objects has no plain (bucket_id, name) constraint for ON CONFLICT.)
with replaced as (
  update storage.objects set updated_at = now()
  where bucket_id = 'avatars' and name = pg_temp.uid('b')::text || '/avatar.jpg'
  returning 1
)
select is((select count(*)::int from replaced), 1,
  'replacing your own avatar (the app''s upsert) still works');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('avatars', %L)$$,
                        pg_temp.uid('a')::text || '/mine.jpg'),
  '42501', null, 'uploading into someone else''s folder is refused');
reset role;

-- 4. Message reactions.
select ok(not has_function_privilege('anon', 'public.get_message_reactions(uuid)', 'execute')
          and not has_function_privilege('public', 'public.get_message_reactions(uuid)', 'execute'),
  'get_message_reactions is not callable signed out');
select ok(not has_function_privilege('anon', 'public.react_to_message(uuid, text)', 'execute')
          and not has_function_privilege('public', 'public.react_to_message(uuid, text)', 'execute'),
  'react_to_message is not callable signed out');
select ok(has_function_privilege('authenticated', 'public.get_message_reactions(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.react_to_message(uuid, text)', 'execute'),
  'both stay callable signed in');

-- 5. Table rights.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
             and (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                  or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))),
  0, 'anon has no rights on any table in public');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT')
          and not has_table_privilege('anon', 'public.posts', 'SELECT')
          and not has_table_privilege('anon', 'public.app_config', 'SELECT'),
  'e.g. anon cannot read profiles, posts or app_config');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
             and (has_table_privilege('authenticated', c.oid, 'TRUNCATE, REFERENCES, TRIGGER')
                  or has_any_column_privilege('authenticated', c.oid, 'REFERENCES'))),
  0, 'authenticated cannot truncate, reference or trigger any table in public');
create table public.zz_default_privileges_probe (id int);
select ok(not has_table_privilege('anon', 'public.zz_default_privileges_probe',
                                  'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'a new table gives anon nothing by default');
select ok(not has_table_privilege('authenticated', 'public.zz_default_privileges_probe',
                                  'TRUNCATE, REFERENCES, TRIGGER'),
  'nor truncate / references / trigger to authenticated');
drop table public.zz_default_privileges_probe;
set local role anon;
select is(public.username_available('nobody_has_this_name'), true,
  'the signed-out username check still works (it runs as its owner)');
reset role;

-- 6. Reports.
select pg_temp.as_user('c');
select throws_ok($$insert into public.user_reports (reporter_id, reported_user_id, reason)
                   values (pg_temp.uid('c'), pg_temp.uid('a'), 'spam')$$,
  '42501', null, 'a direct report is refused');
select is((public.report_user(pg_temp.uid('a'), 'spam') ->> 'already_reported')::boolean, false,
  'report_user still files a report');
reset role;
select pg_temp.as_user('b');
select is((public.report_post('00000000-0000-0000-0000-0000005ecf91', 'spam') ->> 'already_reported')::boolean,
  false, 'report_post still files a report');
select is((select count(*)::int from public.user_reports where reporter_id = pg_temp.uid('b')), 1,
  'you can still count your own reports (the app''s "already reported" check)');
reset role;
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_reports'
                      and cmd = 'INSERT'),
  'the old insert rule is gone');
select ok(not has_any_column_privilege('authenticated', 'public.user_reports', 'INSERT'),
  'authenticated may not insert any report column');

-- 7. Internal helpers.
select ok(not has_function_privilege('public', 'public.answered_by_post(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.answered_by_post(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.answered_by_post(uuid)', 'execute'),
  'answered_by_post is internal');
select ok(not has_function_privilege('public', 'public.post_invites(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.post_invites(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.post_invites(uuid)', 'execute'),
  'post_invites (it returns invite links) is internal');
select is(jsonb_typeof(public.post_invites('00000000-0000-0000-0000-0000005ecf91')), 'array',
  'the posting functions (run as the owner) can still call it');

select * from finish();
rollback;
