-- Security hardening (20261008100000_security_hardening):
-- * posts and their photos: only the owner, staff, and people allowed by the feed rule
--   (can_view_post: follows, no block either way, owner not banned, feed not locked)
-- * likes and comments only on posts you can see; no direct writes to posts or post_tags
-- * no tag notification across a block or from a banned person
-- * the app inserts only the sign-up columns of a profile
-- * email sign-ups only through complete-signup (marker + checked code)
-- * revoke_user_sessions signs a person out everywhere (server only)
-- * message_reactions_json is internal; get_suggested_follows answers for the caller only
begin;
select plan(46);

update public.app_config set feed_lock_enabled = false, tags_required = false;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000f5' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.post(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000f5a' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.file(p text) returns text language sql immutable as $$
  select pg_temp.uid('a')::text || '/' || p || '.jpg'
$$;

-- a posts; b follows a; c follows nobody; d follows a but a blocked d; s is staff;
-- e is banned and has a post; n is a new account with no profile yet.
insert into auth.users (id, email)
select pg_temp.uid(c), 'sec-' || c || '@example.invalid' from unnest(array['a','b','c','d','e','s','n']) c;
insert into public.profiles (id, username, is_banned)
select pg_temp.uid(c), 'sec_' || c, c = 'e' from unnest(array['a','b','c','d','e','s']) c;
-- Staff need a confirmed email (20261008110000_staff_confirmed_email).
update auth.users set email_confirmed_at = now() where id in (pg_temp.uid('s'));
insert into public.staff_users (user_id, role) values (pg_temp.uid('s'), 'admin');
insert into public.follows (follower_id, following_id) values
  (pg_temp.uid('b'), pg_temp.uid('a')),
  (pg_temp.uid('d'), pg_temp.uid('a'));
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('d'));

-- a's visible post 'v' and hidden post 'h'; e's post 'e'.
insert into public.posts (id, user_id, image_url, image_path, streak_day, hidden_at) values
  (pg_temp.post('v'), pg_temp.uid('a'), 'x', pg_temp.file('v'), 1, null),
  (pg_temp.post('h'), pg_temp.uid('a'), 'x', pg_temp.file('h'), 1, now()),
  (pg_temp.post('e'), pg_temp.uid('e'), 'x', pg_temp.uid('e')::text || '/e.jpg', 1, null);
insert into storage.objects (bucket_id, name) values
  ('posts', pg_temp.file('v')), ('posts', pg_temp.file('h')), ('posts', pg_temp.file('new'));
-- b tags a, so a may post through create_post.
insert into public.tag_challenges (tagger_id, tagged_id, expires_at) values
  (pg_temp.uid('b'), pg_temp.uid('a'), now() + interval '48 hours');

create function pg_temp.posts_of_a() returns int language sql as $$
  select count(*)::int from public.posts where user_id = pg_temp.uid('a')
$$;
create function pg_temp.sees_file(p text) returns boolean language sql as $$
  select exists (select 1 from storage.objects where bucket_id = 'posts' and name = pg_temp.file(p))
$$;

-- 1. Reading posts.
select pg_temp.as_user('b');
select is(pg_temp.posts_of_a(), 1, 'a follower sees the visible post, not the hidden one');
select pg_temp.as_user('c');
select is(pg_temp.posts_of_a(), 0, 'someone who does not follow sees no posts');
select pg_temp.as_user('d');
select is(pg_temp.posts_of_a(), 0, 'someone blocked sees no posts, even while following');
select pg_temp.as_user('a');
select is(pg_temp.posts_of_a(), 2, 'the owner sees their own posts, hidden ones too');
select pg_temp.as_user('s');
select is(pg_temp.posts_of_a(), 2, 'staff see every post (reports need the hidden ones)');
reset role;
update public.app_config set feed_lock_enabled = true;
select pg_temp.as_user('b');
select is(pg_temp.posts_of_a(), 0, 'a follower whose feed is locked sees no posts');
reset role;
update public.app_config set feed_lock_enabled = false;

-- 2. Photos.
select is((select public from storage.buckets where id = 'posts'), false, 'the posts bucket is private');
select pg_temp.as_user('b');
select ok(pg_temp.sees_file('v'), 'a follower can open the visible post''s photo');
select ok(not pg_temp.sees_file('h'), 'but not the hidden post''s photo');
select pg_temp.as_user('c');
select ok(not pg_temp.sees_file('v'), 'someone who does not follow cannot open the photo');
select pg_temp.as_user('a');
select ok(pg_temp.sees_file('h') and pg_temp.sees_file('new'),
  'the owner can open (and sign) every file in their folder, posted or not yet');
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('posts', pg_temp.uid('a')::text || '/up.jpg')$$,
  'the owner can still upload to their folder');
-- Removing goes through the Storage API (production refuses direct deletes from storage.objects);
-- the owner's delete rule is unchanged, so check it covers their folder.
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'posts_storage_delete' and cmd = 'DELETE'),
  'and remove their files (the owner delete rule is in place)');
select pg_temp.as_user('s');
select ok(pg_temp.sees_file('h'), 'staff can open a hidden post''s photo for a report');
reset role;

-- 3. Likes and comments only on posts you can see.
select pg_temp.as_user('c');
select throws_ok(
  $$insert into public.post_likes (post_id, user_id) values (pg_temp.post('v'), pg_temp.uid('c'))$$,
  '42501', null, 'no liking a post you cannot see');
select throws_ok(
  $$insert into public.post_comments (post_id, user_id, content) values (pg_temp.post('v'), pg_temp.uid('c'), 'hi')$$,
  '42501', null, 'no commenting on a post you cannot see');
select throws_ok($$select public.toggle_like(pg_temp.post('v'), pg_temp.uid('c'))$$,
  '42501', null, 'toggle_like refuses a post you cannot see');
select pg_temp.as_user('b');
select lives_ok(
  $$insert into public.post_comments (post_id, user_id, content) values (pg_temp.post('v'), pg_temp.uid('b'), 'nice')$$,
  'a follower can comment');
select is((select liked from public.toggle_like(pg_temp.post('v'), pg_temp.uid('b'))), true,
  'a follower can like');
select throws_ok(
  $$insert into public.post_likes (post_id, user_id) values (pg_temp.post('h'), pg_temp.uid('b'))$$,
  '42501', null, 'no liking a hidden post');
reset role;
update public.profiles set is_banned = true where id = pg_temp.uid('b');
select pg_temp.as_user('b');
select throws_ok(
  $$insert into public.post_comments (post_id, user_id, content) values (pg_temp.post('v'), pg_temp.uid('b'), 'x')$$,
  '42501', null, 'a banned person still cannot comment');
reset role;
update public.profiles set is_banned = false where id = pg_temp.uid('b');
select ok(not has_function_privilege('authenticated', 'public.get_feed_posts(integer, timestamp with time zone, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_feed_posts(integer, timestamp with time zone, uuid)', 'execute'),
  'the old unchecked feed read is gone');

-- 4. Posting only through create_post.
select ok(not has_table_privilege('authenticated', 'public.posts', 'insert')
  and not has_table_privilege('anon', 'public.posts', 'insert'), 'no direct inserts into posts');
select ok(not has_table_privilege('authenticated', 'public.post_tags', 'insert')
  and not has_table_privilege('authenticated', 'public.post_tags', 'update')
  and not has_table_privilege('authenticated', 'public.post_tags', 'delete')
  and not has_table_privilege('anon', 'public.post_tags', 'insert'), 'no direct writes to post_tags');
select pg_temp.as_user('a');
select throws_ok(
  $$insert into public.posts (user_id, image_url, streak_day) values (pg_temp.uid('a'), 'x', 1)$$,
  '42501', null, 'a direct post insert is refused');
select throws_ok(
  $$insert into public.post_tags (post_id, user_id) values (pg_temp.post('v'), pg_temp.uid('b'))$$,
  '42501', null, 'a direct tag insert is refused');
select is(
  (public.create_post('66666666-0000-0000-0000-0000000f5a01', pg_temp.file('new'), null, null, '{}'::uuid[])
    -> 'post' ->> 'user_id')::uuid,
  pg_temp.uid('a'), 'create_post still posts');
reset role;

-- 5. Tag notifications.
delete from public.notifications where type = 'tag';
insert into public.post_tags (post_id, user_id) values
  (pg_temp.post('v'), pg_temp.uid('b')),
  (pg_temp.post('v'), pg_temp.uid('d')),
  (pg_temp.post('e'), pg_temp.uid('c'));
select is((select count(*)::int from public.notifications where type = 'tag' and user_id = pg_temp.uid('b')), 1,
  'a tag still notifies');
select is((select count(*)::int from public.notifications where type = 'tag' and user_id = pg_temp.uid('d')), 0,
  'no tag notification across a block');
select is((select count(*)::int from public.notifications where type = 'tag' and user_id = pg_temp.uid('c')), 0,
  'no tag notification from a banned person');

-- 6. Profile inserts: the sign-up columns only.
select ok(not has_table_privilege('anon', 'public.profiles', 'insert'), 'signed-out apps cannot insert profiles');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'streak_current', 'insert')
  and not has_column_privilege('authenticated', 'public.profiles', 'is_banned', 'insert'),
  'the app has no right to insert points or a ban');
select pg_temp.as_user('n');
select throws_ok(
  $$insert into public.profiles (id, username, streak_current) values (pg_temp.uid('n'), 'sec_n', 99)$$,
  '42501', null, 'you cannot start with points');
select throws_ok(
  $$insert into public.profiles (id, username, created_at) values (pg_temp.uid('n'), 'sec_n', now() - interval '1 year')$$,
  '42501', null, 'nor backdate your account');
select lives_ok(
  $$insert into public.profiles (id, username, display_name, first_name, last_name, date_of_birth,
                                 contact_number, fitness_goals)
    values (pg_temp.uid('n'), 'sec_n', 'N', 'N', 'M', '2000-01-01', '1', array['run'])$$,
  'the app''s sign-up insert works');
reset role;

-- 7. Email sign-ups only through complete-signup.
create function pg_temp.hook(p_provider text, p_email text, p_via text) returns jsonb language sql as $$
  select public.hook_require_verified_signup(jsonb_build_object('user', jsonb_build_object(
    'email', p_email,
    'app_metadata', jsonb_strip_nulls(jsonb_build_object('provider', p_provider, 'signup_via', p_via)))));
$$;
-- (Since 20261008130000_security_followups the claim stamp decides, not the marker.)
insert into public.otp_codes (email, code_hash, expires_at, used, verified_at, signup_claimed_at) values
  ('sec-hook@example.invalid', 'x', now() + interval '10 minutes', true, now() - interval '1 minute', null),
  ('sec-claimed@example.invalid', 'x', now() + interval '10 minutes', true, now() - interval '1 minute', now());
select is(pg_temp.hook('email', 'sec-hook@example.invalid', null) #>> '{error,http_code}', '403',
  'a public sign-up is refused even with a checked code');
select is(pg_temp.hook('email', 'sec-hook@example.invalid', 'complete-signup') #>> '{error,http_code}', '403',
  'a marker alone (no claim stamp) is refused');
select is(pg_temp.hook('email', 'sec-claimed@example.invalid', 'complete-signup'), '{}'::jsonb,
  'complete-signup with a claimed code is allowed');
select is(pg_temp.hook('email', 'sec-nobody@example.invalid', 'complete-signup') #>> '{error,http_code}', '403',
  'the marker without a checked code is refused');
select is(pg_temp.hook('apple', 'sec-apple@example.invalid', null), '{}'::jsonb, 'Apple sign-in still works');

-- 8. Signing a person out everywhere.
insert into auth.sessions (id, user_id)
select gen_random_uuid(), pg_temp.uid(c) from unnest(array['a','a','b']) c;
insert into auth.refresh_tokens (token, user_id, session_id)
select md5(s.id::text), s.user_id::text, s.id from auth.sessions s
where s.user_id in (pg_temp.uid('a'), pg_temp.uid('b'));
select public.revoke_user_sessions(pg_temp.uid('a'));
select is((select count(*)::int from auth.sessions where user_id = pg_temp.uid('a'))
        + (select count(*)::int from auth.refresh_tokens where user_id = pg_temp.uid('a')::text), 0,
  'every session and refresh token of that person is gone');
select is((select count(*)::int from auth.sessions where user_id = pg_temp.uid('b')), 1,
  'other people stay signed in');
select ok(has_function_privilege('service_role', 'public.revoke_user_sessions(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_user_sessions(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.revoke_user_sessions(uuid)', 'execute'),
  'only the server can sign people out');

-- 9. Small things.
select ok(not has_function_privilege('anon', 'public.message_reactions_json(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.message_reactions_json(uuid, uuid)', 'execute'),
  'message_reactions_json is internal');
select pg_temp.as_user('b');
select is((select count(*)::int from public.get_suggested_follows(pg_temp.uid('c'))
           where id in (pg_temp.uid('b'), pg_temp.uid('a'))), 0,
  'suggestions are for the caller, whatever id is passed (never yourself, never who you follow)');
select ok(exists (select 1 from public.get_suggested_follows(pg_temp.uid('b')) where id = pg_temp.uid('c')),
  'the app''s own call still gets suggestions');
reset role;

select * from finish();
rollback;
