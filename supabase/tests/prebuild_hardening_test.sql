-- Pre-build review fixes (20261008180000_prebuild_hardening, 2026-10-08):
-- 1. get_user_posts: a banned person's profile shows nobody else anything, not even padlocks
-- 2. one follow notice and one like notice per pair a day, so follow/unfollow and like/unlike
--    loops can't flood someone
-- 3. invite codes: 20 unknown codes an hour per caller (the account when signed in, else the
--    address), then code lookups are refused; full link tokens are never limited
-- 4. reporting a post or comment you can't see answers the same as an id that doesn't exist
-- Every check reads only this test's own people.
begin;
select plan(37);

update public.app_config set feed_lock_enabled = false, tags_required = false;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000009c18' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
-- Signed out, calling from one address (the proxy appends the real one last).
create function pg_temp.signed_out_from(p_ip text) returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{}', true),
         set_config('request.headers',
           json_build_object('x-forwarded-for', '10.9.9.9, ' || p_ip)::text, true);
$$;
create function pg_temp.notes(p_to text, p_from text, p_type text) returns int language sql as $$
  select count(*)::int from public.notifications
  where user_id = pg_temp.uid(p_to) and actor_id = pg_temp.uid(p_from) and type = p_type
$$;
create function pg_temp.post(p text) returns uuid language sql immutable as $$
  select ('22222222-0000-0000-0000-0000009c18' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
-- n unknown codes looked up; how many answered nothing.
create function pg_temp.misses(n int, p_prefix text) returns int language sql as $$
  select count(*)::int from generate_series(1, n) g
  where public.get_invite_preview(p_prefix || lpad(g::text, 3, '0')) is null
$$;

-- o: banned, private. q: banned, public. s: a stranger. p: private, f follows p. t: staff.
-- r is followed and liked by a and x. i sends invites; n and m are new and guess codes.
insert into auth.users (id, email)
select pg_temp.uid(c), 'pbh-' || c || '@example.invalid'
from unnest(array['o','q','s','p','f','t','r','a','x','i','n','m']) c;
insert into public.profiles (id, username, is_banned)
select pg_temp.uid(c), 'pbh_' || c, c in ('o', 'q')
from unnest(array['o','q','s','p','f','t','r','a','x','i','n','m']) c;
update public.profiles set is_private = true, posts_visibility = 'followers'
where id in (pg_temp.uid('o'), pg_temp.uid('p'));
update public.profiles set posts_visibility = 'everyone'
where id in (pg_temp.uid('q'), pg_temp.uid('r'));
update auth.users set email_confirmed_at = now() where id = pg_temp.uid('t');
insert into public.staff_users (user_id, role) values (pg_temp.uid('t'), 'admin');
insert into public.follows (follower_id, following_id) values (pg_temp.uid('f'), pg_temp.uid('p'));
insert into public.posts (id, user_id, image_url, image_path, streak_day)
select pg_temp.post(c), pg_temp.uid(c), 'x', pg_temp.uid(c)::text || '/p.jpg', 1
from unnest(array['o','q','p','r']) c;
insert into public.post_comments (id, post_id, user_id, content)
values ('33333333-0000-0000-0000-0000009c1801', pg_temp.post('p'), pg_temp.uid('f'), 'nice');
insert into public.invites (token, code, inviter_id, expires_at) values
  ('9c18aaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'PBHAAA', pg_temp.uid('i'), now() + interval '7 days'),
  ('9c18bbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'PBHBBB', pg_temp.uid('i'), now() + interval '7 days');

-- 1. A banned person's posts.
select pg_temp.as_user('s');
select is(public.get_user_posts(pg_temp.uid('o')), '{"locked": true, "items": []}'::jsonb,
  'a stranger gets nothing from a banned private account: no padlocks, tags or counts');
select is(public.get_user_posts(pg_temp.uid('q')), '{"locked": true, "items": []}'::jsonb,
  'nor from a banned public account');
select pg_temp.as_user('t');
select is(public.get_user_posts(pg_temp.uid('q')), '{"locked": true, "items": []}'::jsonb,
  'staff read a banned account in the staff portal, not here');
select pg_temp.as_user('q');
select is(jsonb_array_length(public.get_user_posts(pg_temp.uid('q')) -> 'items'), 1,
  'the banned person still sees their own posts');
select pg_temp.as_user('s');
select is(jsonb_array_length(public.get_user_posts(pg_temp.uid('r')) -> 'items'), 1,
  'a public account that is not banned still shows its posts');

-- 2. One follow notice and one like notice per pair a day.
select pg_temp.as_user('a');
select public.set_following(pg_temp.uid('r'), true);
select public.set_following(pg_temp.uid('r'), false);
select public.set_following(pg_temp.uid('r'), true);
reset role;
select is(pg_temp.notes('r', 'a', 'follow'), 1, 'follow, unfollow, follow: one notice');
select pg_temp.as_user('x');
select public.set_following(pg_temp.uid('r'), true);
reset role;
select is(pg_temp.notes('r', 'x', 'follow'), 1, 'someone else following still notifies');
update public.notifications set created_at = now() - interval '25 hours'
where user_id = pg_temp.uid('r') and actor_id = pg_temp.uid('a') and type = 'follow';
select pg_temp.as_user('a');
select public.set_following(pg_temp.uid('r'), false);
select public.set_following(pg_temp.uid('r'), true);
reset role;
select is(pg_temp.notes('r', 'a', 'follow'), 2, 'a day later a follow notifies again');

select pg_temp.as_user('a');
select public.toggle_like(pg_temp.post('r'), pg_temp.uid('a'));
select public.toggle_like(pg_temp.post('r'), pg_temp.uid('a'));
select public.toggle_like(pg_temp.post('r'), pg_temp.uid('a'));
reset role;
select is(pg_temp.notes('r', 'a', 'like'), 1, 'like, unlike, like: one notice');
select ok(exists (select 1 from public.post_likes
                  where post_id = pg_temp.post('r') and user_id = pg_temp.uid('a')),
  'and the like itself stands');
select pg_temp.as_user('x');
select public.toggle_like(pg_temp.post('r'), pg_temp.uid('x'));
reset role;
select is(pg_temp.notes('r', 'x', 'like'), 1, 'someone else liking still notifies');
update public.notifications set created_at = now() - interval '25 hours'
where user_id = pg_temp.uid('r') and actor_id = pg_temp.uid('a') and type = 'like';
select pg_temp.as_user('a');
select public.toggle_like(pg_temp.post('r'), pg_temp.uid('a'));
select public.toggle_like(pg_temp.post('r'), pg_temp.uid('a'));
reset role;
select is(pg_temp.notes('r', 'a', 'like'), 2, 'a day later a like notifies again');

-- 3. Invite code guessing.
reset role;
select ok(not has_function_privilege('anon', 'public.invite_code_limit(text)', 'execute')
          and not has_function_privilege('authenticated', 'public.invite_code_limit(text)', 'execute'),
  'the limit helper is internal');
select pg_temp.signed_out_from('203.0.113.7');
select is(pg_temp.misses(20, 'ZZA'), 20, 'signed out: 20 unknown codes answer nothing');
select throws_ok($$select public.get_invite_preview('ZZA021')$$, '22023',
  'too many tries, try again later', 'the 21st code from that address is refused');
select throws_ok($$select public.get_invite_preview('PBHAAA')$$, '22023',
  'too many tries, try again later', 'so is a real code, until the hour is up');
select is(public.get_invite_preview('9c18aaaaaaaaaaaaaaaaaaaaaaaaaaaa') ->> 'username', 'pbh_i',
  'a full link token still works');
select pg_temp.signed_out_from('198.51.100.4');
select is(public.get_invite_preview('PBHAAA') ->> 'username', 'pbh_i',
  'another address can still use a code');
select set_config('request.headers',
  '{"x-forwarded-for": "203.0.113.7", "cf-connecting-ip": "198.51.100.4"}', true);
select is(public.get_invite_preview('PBHAAA') ->> 'username', 'pbh_i',
  'the Cloudflare address wins over the forwarded list');
select set_config('request.headers', '{"x-forwarded-for": "1.2.3.4, 203.0.113.7"}', true);
select throws_ok($$select public.get_invite_preview('PBHAAA')$$, '22023',
  'too many tries, try again later', 'a made-up first address does not get round the limit');
reset role;
select is((select count(*)::int from public.auth_rate_limits
           where ip = 'ip:203.0.113.7' and action = 'invite_code_miss'), 20,
  'only the 20 misses were counted, under the address');

-- No usable address: everyone signed out shares one key, so it gets a much higher cap (1000 an
-- hour) and one guesser can't lock everyone out of typing a code.
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{}', true),
       set_config('request.headers', '{}', true);
select is(pg_temp.misses(21, 'ZZD'), 21,
  'with no address, the 21st unknown code still answers (shared cap, not 20)');
select is(public.get_invite_preview('PBHAAA') ->> 'username', 'pbh_i',
  'and a real code still works');
reset role;
select is((select count(*)::int from public.auth_rate_limits
           where ip = 'ip:unknown' and action = 'invite_code_miss'), 21,
  'those misses are counted under the shared unknown key');

-- Signed in: counted under the account, so the same address signed out is unaffected.
select pg_temp.as_user('n');
select set_config('request.headers', '{"x-forwarded-for": "192.0.2.50"}', true);
select is(pg_temp.misses(19, 'ZZB'), 19, 'signed in: unknown codes answer nothing');
select is(public.claim_invite('ZZB020'), null,
  'claiming an unknown code answers nothing, and counts as a miss');
select throws_ok($$select public.claim_invite('PBHAAA')$$, '22023',
  'too many tries, try again later', 'after 20 misses, claiming by code is refused');
select throws_ok($$select public.get_invite_preview('PBHAAA')$$, '22023',
  'too many tries, try again later', 'and so is a code preview');
select is(public.claim_invite('9c18aaaaaaaaaaaaaaaaaaaaaaaaaaaa') ->> 'follow_status', 'following',
  'a full link token can still be claimed');
reset role;
select is((select count(*)::int from public.auth_rate_limits
           where ip = 'user:' || pg_temp.uid('n') and action = 'invite_code_miss'), 20,
  'the misses are counted under the account');
select pg_temp.signed_out_from('192.0.2.50');
select is(public.get_invite_preview('ZZC001'), null,
  'the same address signed out is not limited by the account''s misses');
select pg_temp.as_user('m');
select set_config('request.headers', '{"x-forwarded-for": "192.0.2.50"}', true);
select is(public.claim_invite('PBHBBB') ->> 'follow_status', 'following',
  'another account on that address can still claim by code');

-- 4. Reporting what you can't see.
select pg_temp.as_user('s');
select throws_ok(format('select public.report_post(%L, %L)', pg_temp.post('p'), 'spam'), '22023',
  'that does not exist', 'a stranger reporting a private account''s post: "that does not exist"');
select throws_ok(format('select public.report_post(%L, %L)', gen_random_uuid(), 'spam'), '22023',
  'that does not exist', 'the same answer as a post that does not exist');
select throws_ok($$select public.report_comment('33333333-0000-0000-0000-0000009c1801', 'spam')$$,
  '22023', 'that does not exist', 'and the same for a comment on that post');
select pg_temp.as_user('f');
select is(public.report_post(pg_temp.post('p'), 'spam') ->> 'already_reported', 'false',
  'a follower can report the post');
select pg_temp.as_user('t');
select is(public.report_comment('33333333-0000-0000-0000-0000009c1801', 'spam') ->> 'already_reported',
  'false', 'staff can report what they are not shown in the app');
reset role;

select * from finish();
rollback;
