-- Tag slots: links and in-app invites made on tap (before the post), and each
-- slot's state. Every check reads only this test's own people, so it also runs on a database with
-- history.
begin;
select plan(55);

update public.app_config set invite_links_enabled = true, tags_required = true, tag_count = 3,
  max_open_invites = 10;
-- Quiet hours off, so a reminder's send time is never moved and the counts below are exact.
update public.app_config set quiet_start = '00:00', quiet_end = '00:00';

-- A and B are friends. C is on Mahi but not A's friend; C posted 30 hours ago. N is brand new.
-- E is C's blocker.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f50a', 'tsl-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000f50b', 'tsl-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000f50c', 'tsl-c@example.invalid'),
  ('00000000-0000-0000-0000-00000000f50d', 'tsl-n@example.invalid'),
  ('00000000-0000-0000-0000-00000000f50e', 'tsl-e@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-00000000f50a', 'tsl_a', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000f50b', 'tsl_b', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000f50c', 'tsl_c', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000f50d', 'tsl_n', 'Europe/London'),
  ('00000000-0000-0000-0000-00000000f50e', 'tsl_e', 'Europe/London');
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-00000000f50a', '00000000-0000-0000-0000-00000000f50b'),
  ('00000000-0000-0000-0000-00000000f50b', '00000000-0000-0000-0000-00000000f50a');
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000f50e', '00000000-0000-0000-0000-00000000f50a');
-- C's post 30 hours ago (triggers off so created_at sticks).
set local session_replication_role = replica;
insert into public.posts (user_id, image_url, image_path, streak_day, created_at, post_date) values
  ('00000000-0000-0000-0000-00000000f50c', 'x', '00000000-0000-0000-0000-00000000f50c/c0.jpg', 1,
   now() - interval '30 hours', current_date - 1);
set local session_replication_role = origin;
insert into storage.objects (bucket_id, name) values
  ('posts', '00000000-0000-0000-0000-00000000f50a/a1.jpg'),
  ('posts', '00000000-0000-0000-0000-00000000f50b/b1.jpg');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- The test's way into rows the app can't read, as the owner.
create function pg_temp.challenge(p_id uuid) returns public.tag_challenges
language sql security definer as $$
  select * from public.tag_challenges where id = p_id;
$$;
create function pg_temp.slot_state(p_id uuid) returns text language sql as $$
  select state from public.get_tag_slots() where challenge_id = p_id;
$$;
create function pg_temp.friends(p_a uuid, p_b uuid) returns boolean
language sql security definer as $$
  select exists (select 1 from public.follows where follower_id = p_a and following_id = p_b)
     and exists (select 1 from public.follows where follower_id = p_b and following_id = p_a);
$$;
create function pg_temp.token(p_challenge uuid) returns text language sql security definer as $$
  select token from public.invites where challenge_id = p_challenge;
$$;
create table pg_temp.ids (name text primary key, id uuid);
grant all on pg_temp.ids to authenticated;

-- 1. A link, made on tap before the post.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50a');
insert into pg_temp.ids select 'link', (public.make_invite_link() ->> 'challenge_id')::uuid;
select is(pg_temp.slot_state((select id from pg_temp.ids where name = 'link')), 'link_ready',
  'a new link is ready to share');
select ok(
  (select url = (select invite_base_url from public.app_config) || token
          and code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' and kind = 'link'
   from public.get_tag_slots() where challenge_id = (select id from pg_temp.ids where name = 'link')),
  'the slot carries its link and 6-character code');
select lives_ok($$select public.mark_invite_shared((select id from pg_temp.ids where name = 'link'))$$,
  'sharing it is recorded');
select is(pg_temp.slot_state((select id from pg_temp.ids where name = 'link')), 'shared',
  'the slot now says shared');

-- 2. The cap on open invites.
reset role;
update public.app_config set max_open_invites = 1;
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50a');
select throws_ok($$select public.make_invite_link()$$, '22023', 'too many open invites',
  'past the cap, no more links');
reset role;
update public.app_config set max_open_invites = 10;

-- 3. An in-app invite for someone on Mahi who isn't a friend.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50a');
insert into pg_temp.ids
select 'req', (public.invite_to_tag('00000000-0000-0000-0000-00000000f50c') ->> 'challenge_id')::uuid;
select is(pg_temp.slot_state((select id from pg_temp.ids where name = 'req')), 'invite_sent',
  'the slot says invite sent');
select is(
  (select username from public.get_tag_slots() where challenge_id = (select id from pg_temp.ids where name = 'req')),
  'tsl_c', 'the slot names who it went to');
select throws_ok($$select public.invite_to_tag('00000000-0000-0000-0000-00000000f50c')$$,
  '22023', 'already invited', 'the same person twice is refused');
select throws_ok($$select public.invite_to_tag('00000000-0000-0000-0000-00000000f50b')$$,
  '22023', 'already friends', 'a friend is tagged, not invited');
select throws_ok($$select public.invite_to_tag('00000000-0000-0000-0000-00000000f50a')$$,
  '22023', 'cannot invite that person', 'you cannot invite yourself');
select throws_ok($$select public.invite_to_tag('00000000-0000-0000-0000-00000000f50e')$$,
  '22023', 'cannot invite that person', 'nor someone who blocked you');
reset role;
select is(
  (select count(*)::int from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000f50c' and type = 'tag_invite'
     and challenge_id = (select id from pg_temp.ids where name = 'req')),
  1, 'C hears about the invite');

-- The invite went out before C's last post (31 hours ago).
update public.tag_challenges set created_at = now() - interval '31 hours',
  requested_at = now() - interval '31 hours'
where id = (select id from pg_temp.ids where name = 'req');

-- 4. A pending invite is nobody's tag yet.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50c');
select ok(
  (select requested_at is not null and accepted_at is null from public.tag_challenges
   where id = (select id from pg_temp.ids where name = 'req')),
  'C can read where the invite is at (the notifications list)');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50d');
select is(
  (select count(*)::int from public.tag_challenges where id = (select id from pg_temp.ids where name = 'req')),
  0, 'nobody else can');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50c');
select is((select count(*)::int from public.get_open_tags()), 0, 'C has no tag to answer yet');
reset role;
select ok(not public.viewer_is_locked('00000000-0000-0000-0000-00000000f50c'),
  'a pending invite does not lock C''s feed');
select is(
  (select count(*)::int from public.push_outbox
   where challenge_id = (select id from pg_temp.ids where name = 'req') and kind = 'tag_reminder'),
  0, 'no reminders while it waits');

-- 5. N joins from the link before A posts: friends, no clock yet.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50d');
select lives_ok(
  $$select public.claim_invite(pg_temp.token((select id from pg_temp.ids where name = 'link')))$$,
  'N joins from the link');
reset role;
select ok(pg_temp.friends('00000000-0000-0000-0000-00000000f50a', '00000000-0000-0000-0000-00000000f50d'),
  'A and N are friends');
select ok((pg_temp.challenge((select id from pg_temp.ids where name = 'link'))).expires_at is null,
  'no post yet, so no 48 hours yet');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50a');
select is(pg_temp.slot_state((select id from pg_temp.ids where name = 'link')), 'joined',
  'A''s slot says joined');
select is(
  (select username from public.get_tag_slots() where challenge_id = (select id from pg_temp.ids where name = 'link')),
  'tsl_n', 'and names who joined');

-- 6. A slot may be a current friend or someone not on Mahi, even while friends are available.
insert into pg_temp.ids select 'spare', (public.make_invite_link() ->> 'challenge_id')::uuid;
savepoint q3_links;
select lives_ok(
  $$select public.create_post(p_client_id => '33333333-0000-0000-0000-0000000000a1',
      p_image_path => '00000000-0000-0000-0000-00000000f50a/a1.jpg',
      p_slot_ids => array(select id from pg_temp.ids where name in ('link', 'req', 'spare')))$$,
  'three invites may be chosen while a friend is available');
rollback to savepoint q3_links;
savepoint q3_old_app;
select lives_ok(
  $$select public.create_post(p_client_id => '33333333-0000-0000-0000-0000000000a1',
      p_image_path => '00000000-0000-0000-0000-00000000f50a/a1.jpg', p_invite_count => 3)$$,
  'the older app may also choose three people not on Mahi');
rollback to savepoint q3_old_app;
select throws_ok(
  $$select public.create_post(p_client_id => '33333333-0000-0000-0000-0000000000a1',
      p_image_path => '00000000-0000-0000-0000-00000000f50a/a1.jpg',
      p_tagged_ids => array['00000000-0000-0000-0000-00000000f50b']::uuid[],
      p_slot_ids => array(select id from pg_temp.ids where name in ('link', 'req', 'spare')))$$,
  '22023', null, 'a fourth slot is refused');
select throws_ok(
  $$select public.create_post(p_client_id => '33333333-0000-0000-0000-0000000000a1',
      p_image_path => '00000000-0000-0000-0000-00000000f50a/a1.jpg',
      p_tagged_ids => array['00000000-0000-0000-0000-00000000f50b']::uuid[],
      p_slot_ids => array['00000000-0000-0000-0000-000000000bad']::uuid[])$$,
  '22023', 'that invite is no longer open', 'a slot that is not yours is refused');

-- 7. The post: B tagged, N's link and C's invite in the other two slots.
select lives_ok(
  $$select public.create_post(p_client_id => '33333333-0000-0000-0000-0000000000a1',
      p_image_path => '00000000-0000-0000-0000-00000000f50a/a1.jpg',
      p_tagged_ids => array['00000000-0000-0000-0000-00000000f50b']::uuid[],
      p_slot_ids => array(select id from pg_temp.ids where name in ('link', 'req')))$$,
  'one friend and two slots fill the post');
insert into pg_temp.ids select 'post', id from public.posts
where client_id = '33333333-0000-0000-0000-0000000000a1';
select is(
  (select array_agg(state order by state) from public.get_tag_slots((select id from pg_temp.ids where name = 'post'))),
  array['invite_sent', 'tagged', 'tagged'], 'the post''s slots: two live tags and one waiting');
select is((select count(*)::int from public.get_tag_slots()), 0,
  'the slots moved onto the post; the spare link was dropped');
select ok((pg_temp.challenge((select id from pg_temp.ids where name = 'spare'))).cancelled_at is not null,
  'the spare link is cancelled');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50d');
select is((select count(*)::int from public.get_open_tags()), 1, 'N''s 48 hours start with the post');
reset role;
select ok(
  exists (select 1 from public.post_tags
          where post_id = (select id from pg_temp.ids where name = 'post')
            and user_id = '00000000-0000-0000-0000-00000000f50d'),
  'N shows on the post');
select is(
  (select count(*)::int from public.push_outbox
   where challenge_id = (select id from pg_temp.ids where name = 'link') and kind = 'tag_reminder'),
  2, 'N''s two reminders are queued');
select ok(
  not exists (select 1 from public.post_tags
              where post_id = (select id from pg_temp.ids where name = 'post')
                and user_id = '00000000-0000-0000-0000-00000000f50c'),
  'C is not on the post until they accept');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50b');
select is(
  (select count(*)::int from public.get_tag_slots((select id from pg_temp.ids where name = 'post'))),
  0, 'only the person who posted sees the slots');

-- 8. C accepts.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50b');
select throws_ok(
  $$select public.respond_tag_invite((select id from pg_temp.ids where name = 'req'), true)$$,
  '22023', 'that invite is no longer open', 'only the person invited can answer it');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50c');
select lives_ok($$select public.respond_tag_invite((select id from pg_temp.ids where name = 'req'), true)$$,
  'C accepts');
select is((select count(*)::int from public.get_open_tags()), 1, 'C now has A''s tag to answer');
reset role;
select ok(not pg_temp.friends('00000000-0000-0000-0000-00000000f50a', '00000000-0000-0000-0000-00000000f50c'),
  'accepting no longer makes A and C follow each other (20261008170000)');
select ok(public.viewer_is_locked('00000000-0000-0000-0000-00000000f50c'),
  'the tag locks C''s feed, though the invite was made before C''s last post');
select is(
  (select count(*)::int from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000f50a' and type = 'tag_invite_accepted'),
  1, 'A hears C accepted');
select is(
  (select count(*)::int from public.push_outbox
   where challenge_id = (select id from pg_temp.ids where name = 'req') and kind = 'tag_reminder'),
  2, 'C''s two reminders are queued');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50a');
select is(
  (select array_agg(state order by state) from public.get_tag_slots((select id from pg_temp.ids where name = 'post'))),
  array['tagged', 'tagged', 'tagged'], 'all three slots are live tags');

-- 9. Posting again needs a tag: no new slots for A until then.
select throws_ok($$select public.make_invite_link()$$, 'P0001', 'reactive posting: not tagged',
  'no tag to answer, no new slots');

-- 10. Declining. B (tagged by A) invites C.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50b');
insert into pg_temp.ids
select 'req2', (public.invite_to_tag('00000000-0000-0000-0000-00000000f50c') ->> 'challenge_id')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50c');
select lives_ok($$select public.respond_tag_invite((select id from pg_temp.ids where name = 'req2'), false)$$,
  'C says not now');
select throws_ok(
  $$select public.respond_tag_invite((select id from pg_temp.ids where name = 'req2'), true)$$,
  '22023', 'that invite is no longer open', 'a declined invite cannot be accepted after');
reset role;
select ok(not pg_temp.friends('00000000-0000-0000-0000-00000000f50b', '00000000-0000-0000-0000-00000000f50c'),
  'declining makes no friendship');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50b');
select is(pg_temp.slot_state((select id from pg_temp.ids where name = 'req2')), null,
  'a declined invite leaves B''s open slots');

-- 11. Removing a slot before posting.
insert into pg_temp.ids select 'b_link', (public.make_invite_link() ->> 'challenge_id')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50a');
select throws_ok($$select public.cancel_tag_slot((select id from pg_temp.ids where name = 'b_link'))$$,
  '22023', 'that invite is no longer open', 'nobody else can remove your slot');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50b');
select lives_ok($$select public.cancel_tag_slot((select id from pg_temp.ids where name = 'b_link'))$$,
  'B removes the slot');
select is(pg_temp.slot_state((select id from pg_temp.ids where name = 'b_link')), null, 'and it is gone');

-- 12. Slots nobody posted with run out with the link.
insert into pg_temp.ids select 'old', (public.make_invite_link() ->> 'challenge_id')::uuid;
reset role;
update public.tag_challenges set created_at = now() - interval '8 days'
where id = (select id from pg_temp.ids where name = 'old');
select public.expire_invites();
select ok((pg_temp.challenge((select id from pg_temp.ids where name = 'old'))).cancelled_at is not null,
  'a week-old slot with no post is cancelled');

-- 13. Search finds anyone on Mahi, and says who is a friend.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50b');
select is(
  (select array_agg(username || ':' || is_friend order by username)
   from public.search_tag_people('tsl_')),
  array['tsl_a:true', 'tsl_c:false', 'tsl_e:false', 'tsl_n:false'],
  'B finds friends and people who are not, never B');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50a');
select is(
  (select array_agg(username order by username) from public.search_tag_people('tsl_')),
  array['tsl_b', 'tsl_c', 'tsl_n'], 'someone who blocked you never shows');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f50b');
select is(
  (select array_agg(username order by username) from public.search_tag_people('')),
  array['tsl_a'], 'with nothing typed, only friends');

select * from finish();
rollback;
