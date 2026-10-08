-- Security follow-ups (20261008130000_security_followups):
-- * an email account is created only within 5 minutes of complete-signup stamping its checked code
-- * a reporter can't read the copy their report keeps (staff read it through the staff functions)
-- * get_comment_likes / get_comment_likers give nothing for a post you can't see or a removed comment
begin;
select plan(12);

update public.app_config set feed_lock_enabled = false, tags_required = false;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000f7' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.hook(p_provider text, p_email text) returns jsonb language sql as $$
  select public.hook_require_verified_signup(jsonb_build_object('user', jsonb_build_object(
    'email', p_email, 'app_metadata', jsonb_build_object('provider', p_provider))));
$$;

-- 1. Sign-up stamp.
insert into public.otp_codes (email, code_hash, expires_at, used, verified_at, signup_claimed_at) values
  ('fu-checked@example.invalid', 'x', now() + interval '10 minutes', true, now() - interval '2 minutes', null),
  ('fu-claimed@example.invalid', 'x', now() + interval '10 minutes', true, now() - interval '2 minutes', now() - interval '1 minute'),
  ('fu-old-claim@example.invalid', 'x', now() + interval '10 minutes', true, now() - interval '20 minutes', now() - interval '10 minutes');
select is(pg_temp.hook('email', 'fu-checked@example.invalid') #>> '{error,http_code}', '403',
  'a public sign-up is refused even with a checked code (no claim stamp)');
select is(pg_temp.hook('email', 'fu-claimed@example.invalid'), '{}'::jsonb,
  'complete-signup''s stamp from a minute ago lets the account be created');
select is(pg_temp.hook('email', 'fu-old-claim@example.invalid') #>> '{error,http_code}', '403',
  'a stamp older than 5 minutes is not enough');
select is(pg_temp.hook('apple', 'fu-apple@example.invalid'), '{}'::jsonb, 'Apple sign-in still works');

-- a posts; b follows a; c follows nobody.
insert into auth.users (id, email)
select pg_temp.uid(c), 'fu-' || c || '@example.invalid' from unnest(array['a','b','c']) c;
insert into public.profiles (id, username)
select pg_temp.uid(c), 'fu_' || c from unnest(array['a','b','c']) c;
-- a's workouts are for approved followers only (since 20261008170000 a public account's are open
-- to anyone signed in).
update public.profiles set is_private = true, posts_visibility = 'followers' where id = pg_temp.uid('a');
insert into public.follows (follower_id, following_id) values (pg_temp.uid('b'), pg_temp.uid('a'));
insert into public.posts (id, user_id, image_url, image_path, streak_day, caption)
values ('00000000-0000-0000-0000-0000000f7a01', pg_temp.uid('a'), 'x',
        pg_temp.uid('a')::text || '/p.jpg', 1, 'private caption');
insert into public.post_comments (id, post_id, user_id, content, removed_at) values
  ('00000000-0000-0000-0000-0000000f7c01', '00000000-0000-0000-0000-0000000f7a01', pg_temp.uid('b'), 'kept', null),
  ('00000000-0000-0000-0000-0000000f7c02', '00000000-0000-0000-0000-0000000f7a01', pg_temp.uid('b'), 'removed', now());
insert into public.comment_likes (comment_id, user_id) values
  ('00000000-0000-0000-0000-0000000f7c01', pg_temp.uid('a')),
  ('00000000-0000-0000-0000-0000000f7c02', pg_temp.uid('a'));

-- 2. Report copies.
select pg_temp.as_user('c');
select from public.report_post('00000000-0000-0000-0000-0000000f7a01', 'other');
select throws_ok($$select snapshot from public.user_reports where reporter_id = pg_temp.uid('c')$$,
  '42501', null, 'a reporter cannot read the copy their report keeps');
select is((select count(*)::int from public.user_reports where reporter_id = pg_temp.uid('c')), 1,
  'a reporter can still count their own reports (the app''s "already reported" check)');
reset role;
select is((select snapshot ->> 'caption' from public.user_reports where reporter_id = pg_temp.uid('c')),
  'private caption', 'the copy is still kept for staff');

-- 3. Comment likes follow the post.
select pg_temp.as_user('c');
select is((select count(*)::int from public.get_comment_likes('00000000-0000-0000-0000-0000000f7a01')), 0,
  'get_comment_likes gives nothing for a post you cannot see');
select is((select count(*)::int from public.get_comment_likers('00000000-0000-0000-0000-0000000f7c01')), 0,
  'get_comment_likers gives nothing for a post you cannot see');
select pg_temp.as_user('b');
select is((select array_agg(comment_id) from public.get_comment_likes('00000000-0000-0000-0000-0000000f7a01')),
  array['00000000-0000-0000-0000-0000000f7c01'::uuid], 'a follower gets the kept comment only');
select is((select count(*)::int from public.get_comment_likers('00000000-0000-0000-0000-0000000f7c01')), 1,
  'a follower sees who liked a kept comment');
select is((select count(*)::int from public.get_comment_likers('00000000-0000-0000-0000-0000000f7c02')), 0,
  'nobody is listed for a removed comment');
reset role;

select * from finish();
rollback;
