-- Controls (20261008170000_private_accounts, owner 2026-10-08): who sees your workouts, who can
-- tag you, and what invites do.
-- * public + everyone: anyone signed in sees the workouts (posts, files, comments, likes)
-- * private, or followers / friends: strangers see nothing, get_user_posts says why (no padlocks);
--   a feed-locked approved follower still sees padlocks; the feed and the lists follow the same rule
-- * tags: 'everyone' tags straight away, 'approve' asks first, 'friends' only friends; search and
--   contacts say which; accepting a tag request no longer makes follows, and says what is left
-- * invites: a tag invite on a post = follow each other; a general invite from a private account =
--   the claimer's follow is a request
-- * push words for the new notices and the missed tag
-- Every check reads only this test's own people.
begin;
select plan(57);

update public.app_config set feed_lock_enabled = false, tags_required = false,
  invite_links_enabled = true, max_open_invites = 10;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000009a03' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.follows(p_from text, p_to text) returns boolean language sql as $$
  select exists (select 1 from public.follows
                 where follower_id = pg_temp.uid(p_from) and following_id = pg_temp.uid(p_to))
$$;
create function pg_temp.push(p_to text, p_type text) returns text language sql as $$
  select o.body from public.push_outbox o
  join public.notifications n on o.dedupe_key = 'notification:' || n.id
  where n.user_id = pg_temp.uid(p_to) and n.type = p_type
  order by n.created_at desc limit 1
$$;
create table pg_temp.ids (name text primary key, val text);
grant all on pg_temp.ids to authenticated;

-- o posts; v follows o; w and o are friends; s is a stranger; t tags; q, r, u, x are tagged
-- (q takes tags from everyone, r approves first and is private, u friends only, x friends only and
-- t's friend); y asks to tag r; n, m, k are new people with invites.
insert into auth.users (id, email)
select pg_temp.uid(c), 'ctl-' || c || '@example.invalid'
from unnest(array['o','v','w','s','t','q','r','u','x','y','n','m','k']) c;
insert into public.profiles (id, username)
select pg_temp.uid(c), 'ctl_' || c
from unnest(array['o','v','w','s','t','q','r','u','x','y','n','m','k']) c;
insert into public.follows (follower_id, following_id) values
  (pg_temp.uid('v'), pg_temp.uid('o')),
  (pg_temp.uid('w'), pg_temp.uid('o')), (pg_temp.uid('o'), pg_temp.uid('w')),
  (pg_temp.uid('t'), pg_temp.uid('x')), (pg_temp.uid('x'), pg_temp.uid('t'));
insert into public.posts (id, user_id, image_url, image_path, streak_day)
values ('00000000-0000-0000-0000-0000009a0391', pg_temp.uid('o'), 'x',
        pg_temp.uid('o')::text || '/c.jpg', 1);
insert into storage.objects (bucket_id, name) values
  ('posts', pg_temp.uid('o')::text || '/c.jpg'),
  ('posts', pg_temp.uid('t')::text || '/t.jpg');
insert into public.post_comments (post_id, user_id, content)
values ('00000000-0000-0000-0000-0000009a0391', pg_temp.uid('o'), 'leg day');
insert into public.post_likes (post_id, user_id)
values ('00000000-0000-0000-0000-0000009a0391', pg_temp.uid('v'));

-- 1. Public, workouts to everyone: anyone signed in.
select pg_temp.as_user('s');
select is((select count(*)::int from public.posts where user_id = pg_temp.uid('o')), 1,
  'a public account''s workouts are open to anyone signed in');
select is(public.get_user_posts(pg_temp.uid('o')) -> 'items' -> 0 ->> 'locked', 'false',
  'no padlock on its profile');
select is((select count(*)::int from storage.objects where bucket_id = 'posts'
           and name = pg_temp.uid('o')::text || '/c.jpg'), 1, 'its files open');
select is((select count(*)::int from public.post_comments
           where post_id = '00000000-0000-0000-0000-0000009a0391'), 1, 'its comments show');
select lives_ok($$select public.toggle_like('00000000-0000-0000-0000-0000009a0391', pg_temp.uid('s'))$$,
  'and a stranger can like it');

-- 2. Private: only approved followers.
select pg_temp.as_user('o');
select lives_ok($$select public.set_account_controls(true)$$, 'o goes private');
select pg_temp.as_user('s');
select is((select count(*)::int from public.posts where user_id = pg_temp.uid('o')), 0,
  'a stranger cannot read a private account''s workouts');
select is((select count(*)::int from storage.objects where bucket_id = 'posts'
           and name = pg_temp.uid('o')::text || '/c.jpg'), 0, 'nor its files');
select is((select count(*)::int from public.post_comments
           where post_id = '00000000-0000-0000-0000-0000009a0391'), 0, 'nor its comments');
select is((select count(*)::int from public.post_likes
           where post_id = '00000000-0000-0000-0000-0000009a0391'), 0, 'nor its likes');
select throws_ok($$select public.toggle_like('00000000-0000-0000-0000-0000009a0391', pg_temp.uid('s'))$$,
  '42501', 'not allowed', 'nor like it');
select is((select count(*)::int from public.get_comment_likes('00000000-0000-0000-0000-0000009a0391')), 0,
  'nor its comment likes');
select is(public.get_user_posts(pg_temp.uid('o')),
  '{"locked": true, "restricted": "private", "items": []}'::jsonb,
  'its profile says private, with no padlock squares');
select is((select follower_count::int from public.get_follow_data(null, pg_temp.uid('o'))), 2,
  'its counts still show');
select pg_temp.as_user('v');
select is((select count(*)::int from public.posts where user_id = pg_temp.uid('o')), 1,
  'a follower still sees');
select is(public.get_user_posts(pg_temp.uid('o')) ->> 'locked', 'false', 'with no padlocks');

-- 3. The feed lock stays on top: a locked approved follower sees padlocks.
reset role;
update public.app_config set feed_lock_enabled = true;
select pg_temp.as_user('v');
select ok((select (r ->> 'locked')::boolean and r ->> 'restricted' is null
                  and jsonb_array_length(r -> 'items') = 1
                  and (r -> 'items' -> 0 ->> 'locked')::boolean
                  and r -> 'items' -> 0 ->> 'image_path' is null
           from public.get_user_posts(pg_temp.uid('o')) r),
  'a feed-locked follower keeps the padlocks on the profile');
select ok((select bool_and((i ->> 'locked')::boolean) and count(*) = 1
           from jsonb_array_elements(public.get_feed() -> 'items') i
           where i ->> 'user_id' = pg_temp.uid('o')::text),
  'and in the feed');
reset role;
update public.app_config set feed_lock_enabled = false;

-- 4. Public, workouts to friends.
select pg_temp.as_user('o');
select is(public.set_account_controls(false, 'friends') ->> 'posts_visibility', 'friends',
  'o goes public, workouts to friends');
select pg_temp.as_user('v');
select is(public.get_user_posts(pg_temp.uid('o')),
  '{"locked": true, "restricted": "friends", "items": []}'::jsonb,
  'a one-way follower is told only friends see them');
select is((select count(*)::int from jsonb_array_elements(public.get_feed() -> 'items') i
           where i ->> 'user_id' = pg_temp.uid('o')::text), 0, 'and they leave that follower''s feed');
select pg_temp.as_user('w');
select is((select count(*)::int from public.posts where user_id = pg_temp.uid('o')), 1, 'a friend sees');
select is((select count(*)::int from jsonb_array_elements(public.get_feed() -> 'items') i
           where i ->> 'user_id' = pg_temp.uid('o')::text), 1, 'in the feed too');
select is((select count(*)::int from public.follows where following_id = pg_temp.uid('o')), 2,
  'and reads the lists');
select pg_temp.as_user('s');
select is((select count(*)::int from public.follows where following_id = pg_temp.uid('o')), 0,
  'a stranger can''t read the lists of friends-only workouts');

-- 5. Public, workouts to followers.
select pg_temp.as_user('o');
select lives_ok($$select public.set_account_controls(null, 'followers')$$, 'workouts to followers');
select pg_temp.as_user('s');
select is(public.get_user_posts(pg_temp.uid('o')),
  '{"locked": true, "restricted": "followers", "items": []}'::jsonb,
  'a stranger is told only followers see them');
select pg_temp.as_user('v');
select is((select count(*)::int from public.posts where user_id = pg_temp.uid('o')), 1, 'a follower sees');
reset role;
update public.profiles set is_private = true, posts_visibility = 'everyone' where id = pg_temp.uid('o');
select is(public.effective_posts_visibility(pg_temp.uid('o')), 'followers',
  'private with everyone counts as followers');
update public.profiles set is_private = false where id = pg_temp.uid('o');

-- 6. Tag modes.
select pg_temp.as_user('q');
select lives_ok($$select public.set_account_controls(null, null, 'everyone')$$, 'q takes tags from anyone');
select pg_temp.as_user('r');
select lives_ok($$select public.set_account_controls(true, null, 'approve')$$, 'r is private and approves tags');
select pg_temp.as_user('u');
select lives_ok($$select public.set_account_controls(null, null, 'friends')$$, 'u takes tags from friends');
select pg_temp.as_user('x');
select lives_ok($$select public.set_account_controls(null, null, 'friends')$$, 'so does x, t''s friend');
select pg_temp.as_user('t');
select is((select status from public.set_following(pg_temp.uid('r'), true)), 'requested', 't asks to follow r');
select is((select string_agg(username || ':' || tag_mode, ',' order by username)
           from public.search_tag_people('ctl_')
           where username in ('ctl_q', 'ctl_r', 'ctl_u', 'ctl_x')),
  'ctl_q:direct,ctl_r:request,ctl_u:none,ctl_x:direct', 'search says how each tag would go');
select is((select row(is_private, requested)::text from public.search_tag_people('ctl_r')), '(t,t)',
  'and whether they are private and asked');
reset role;
insert into public.contact_hashes (user_id, kind, hash)
values (pg_temp.uid('u'), 'phone', repeat('ab', 32));
select pg_temp.as_user('t');
select is((select row(tag_mode, is_private, requested)::text
           from public.match_contacts(array[repeat('ab', 32)])),
  '(none,f,f)', 'contacts say the same');
select throws_ok(
  $$select public.create_post(gen_random_uuid(), pg_temp.uid('t')::text || '/t.jpg',
      p_tagged_ids => array[pg_temp.uid('r')])$$,
  '22023', 'cannot tag that person', 'someone who approves first is not tagged straight away');
select throws_ok(
  $$select public.create_post(gen_random_uuid(), pg_temp.uid('t')::text || '/t.jpg',
      p_tagged_ids => array[pg_temp.uid('u')])$$,
  '22023', 'cannot tag that person', 'nor someone who takes tags only from friends');
select lives_ok(
  $$select public.create_post(gen_random_uuid(), pg_temp.uid('t')::text || '/t.jpg',
      p_tagged_ids => array[pg_temp.uid('q'), pg_temp.uid('x')])$$,
  'anyone can tag someone who takes tags from everyone, and friends tag friends');
reset role;
select is((select count(*)::int from public.tag_challenges where tagger_id = pg_temp.uid('t')
           and tagged_id in (pg_temp.uid('q'), pg_temp.uid('x')) and expires_at is not null), 2,
  'both tags start');

-- 7. Tag requests.
select pg_temp.as_user('y');
select throws_ok($$select public.invite_to_tag(pg_temp.uid('u'))$$,
  '22023', 'only takes tags from friends', 'a tag request to friends-only is refused');
select is((select status from public.set_following(pg_temp.uid('r'), true)), 'requested', 'y asks to follow r');
insert into pg_temp.ids select 'req', public.invite_to_tag(pg_temp.uid('r')) ->> 'challenge_id';
select pg_temp.as_user('r');
select is(public.respond_tag_invite((select val::uuid from pg_temp.ids where name = 'req'), true),
  '{"accepted": true, "you_follow_them": false, "they_follow_you": false, "their_follow_request": true}'::jsonb,
  'accepting a tag says what is left: follow back, their request');
select is(public.respond_tag_invite((select val::uuid from pg_temp.ids where name = 'req'), true),
  '{"accepted": true, "you_follow_them": false, "they_follow_you": false, "their_follow_request": true}'::jsonb,
  'the same answer twice');
reset role;
select ok(not pg_temp.follows('y', 'r') and not pg_temp.follows('r', 'y'),
  'accepting a tag no longer makes anyone follow');
select is(pg_temp.push('r', 'tag_invite'), '@ctl_y wants to tag you.', 'the tag request push');
select is(pg_temp.push('y', 'tag_invite_accepted'), '@ctl_r accepted your tag request.',
  'the tag accepted push');

-- 8. Invites.
select pg_temp.as_user('r');
insert into pg_temp.ids select 'mate_r', public.make_mate_invite() ->> 'token';
select pg_temp.as_user('o');
insert into pg_temp.ids select 'mate_o', public.make_mate_invite() ->> 'token';
reset role;
select is(public.get_invite_preview((select val from pg_temp.ids where name = 'mate_r')) ->> 'follow_request',
  'true', 'the invite says a private account approves followers');
select pg_temp.as_user('n');
select is(public.claim_invite((select val from pg_temp.ids where name = 'mate_r')) ->> 'follow_status',
  'requested', 'a general invite from a private account: your follow is a request');
reset role;
select ok(pg_temp.follows('r', 'n') and not pg_temp.follows('n', 'r')
          and exists (select 1 from public.follow_requests
                      where requester_id = pg_temp.uid('n') and target_id = pg_temp.uid('r')),
  'r follows n; n''s follow waits for r');
select is(pg_temp.push('r', 'invite_joined'),
  '@ctl_n joined Mahi from your invite and wants to follow you.', 'r is told n is waiting');
with c as (insert into public.tag_challenges (tagger_id) values (pg_temp.uid('r')) returning id)
insert into pg_temp.ids select 'slot', c.id::text from c;
insert into public.invites (token, code, inviter_id, challenge_id, expires_at)
values ('ctl-slot-token', 'CTLSLT', pg_temp.uid('r'),
        (select val::uuid from pg_temp.ids where name = 'slot'), now() + interval '7 days');
insert into public.follow_requests (requester_id, target_id) values (pg_temp.uid('m'), pg_temp.uid('r'));
select pg_temp.as_user('m');
select is(public.claim_invite('ctl-slot-token') ->> 'follow_status', 'following',
  'a tag invite on a post: you follow each other');
reset role;
select ok(pg_temp.follows('r', 'm') and pg_temp.follows('m', 'r')
          and not exists (select 1 from public.follow_requests where requester_id = pg_temp.uid('m')),
  'both follow, and the waiting request is cleared');
select pg_temp.as_user('k');
select is(public.claim_invite((select val from pg_temp.ids where name = 'mate_o')) ->> 'follow_status',
  'following', 'a general invite from a public account: you follow each other');

-- 9. Suggestions skip people you asked; the missed-tag push.
select pg_temp.as_user('y');
select ok(not exists (select 1 from public.get_suggested_follows(null, 100, 0) where id = pg_temp.uid('r'))
          and exists (select 1 from public.get_suggested_follows(null, 100, 0) where id = pg_temp.uid('o')),
  'suggestions leave out people you already asked');
reset role;
insert into public.notifications (user_id, actor_id, type) values (pg_temp.uid('t'), pg_temp.uid('q'), 'tag_missed');
select is(pg_temp.push('t', 'tag_missed'),
  '@ctl_q missed your tag. Tag them in your next post to get them going again.', 'the missed-tag push');

select * from finish();
rollback;
