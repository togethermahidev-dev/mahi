-- Public and private accounts (20261008170000_private_accounts, owner 2026-10-08):
-- * a follow to a private account is a request the owner confirms or deletes; the requester is told
--   only on acceptance; no "started following you" notice for an approval
-- * set_account_controls is the only way to change the privacy columns; going private keeps
--   followers, going public accepts every pending request at once
-- * get_follow_data answers only for the caller; counts stay visible to everyone
-- * a private account's follower and following lists are closed to strangers (follows_select, get_friends)
-- * remove_follower: silent; removing a Friend ends open tags between you
-- * blocks and bans clear requests; banned requesters are hidden and can't be accepted
-- * races: asking twice, accepting after a cancel, going public with requests waiting; daily cap
-- Every check reads only this test's own people.
begin;
select plan(94);

update public.app_config set feed_lock_enabled = false, tags_required = false;

create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000009a01' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
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
create function pg_temp.follows(p_from text, p_to text) returns boolean language sql as $$
  select exists (select 1 from public.follows
                 where follower_id = pg_temp.uid(p_from) and following_id = pg_temp.uid(p_to))
$$;
create function pg_temp.requested(p_from text, p_to text) returns boolean language sql as $$
  select exists (select 1 from public.follow_requests
                 where requester_id = pg_temp.uid(p_from) and target_id = pg_temp.uid(p_to))
$$;
create function pg_temp.notes(p_to text, p_from text, p_type text) returns int language sql as $$
  select count(*)::int from public.notifications
  where user_id = pg_temp.uid(p_to) and actor_id = pg_temp.uid(p_from) and type = p_type
$$;

-- p goes private; a, b, c, h, i, j, k ask to follow; d gets blocked; e is banned; f followed p
-- before p went private; g and p are friends; m is a stranger.
insert into auth.users (id, email)
select pg_temp.uid(c), 'pa-' || c || '@example.invalid'
from unnest(array['p','a','b','c','d','e','f','g','h','i','j','k','m']) c;
insert into public.profiles (id, username, is_banned)
select pg_temp.uid(c), 'pa_' || c, c = 'e'
from unnest(array['p','a','b','c','d','e','f','g','h','i','j','k','m']) c;
-- Everyone but a shows workouts to everyone (a keeps the starting setting for the first check).
update public.profiles set posts_visibility = 'everyone'
where id in (select pg_temp.uid(c) from unnest(array['p','b','c','d','e','f','g','h','i','j','k','m']) c);
insert into public.follows (follower_id, following_id) values
  (pg_temp.uid('f'), pg_temp.uid('p')),
  (pg_temp.uid('g'), pg_temp.uid('p')),
  (pg_temp.uid('p'), pg_temp.uid('g'));

-- 1. The columns and the table.
select ok((select not is_private and posts_visibility = 'followers' and tag_permission = 'approve'
                  and privacy_chosen_at is null
           from public.profiles where id = pg_temp.uid('a')),
  'a new profile starts public, workouts to followers (owner, D1), tags approve-first, not chosen yet');
select pg_temp.as_user('a');
select throws_ok($$update public.profiles set is_private = true where id = auth.uid()$$,
  '42501', null, 'is_private cannot be written directly');
select throws_ok($$update public.profiles set posts_visibility = 'friends' where id = auth.uid()$$,
  '42501', null, 'posts_visibility cannot be written directly');
select throws_ok($$update public.profiles set tag_permission = 'everyone' where id = auth.uid()$$,
  '42501', null, 'tag_permission cannot be written directly');
select throws_ok($$update public.profiles set privacy_chosen_at = now() where id = auth.uid()$$,
  '42501', null, 'privacy_chosen_at cannot be written directly');
select throws_ok($$insert into public.follow_requests (requester_id, target_id)
                   values (pg_temp.uid('a'), pg_temp.uid('m'))$$,
  '42501', null, 'a request cannot be written directly');
reset role;
select ok(not has_table_privilege('anon', 'public.follow_requests', 'select'),
  'signed-out callers cannot read requests');
select is((select array_agg(a.attname::text order by a.attname)
           from pg_index i
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
           where i.indrelid = 'public.follow_requests'::regclass and i.indisprimary),
  array['id'], 'the key is a random id, so a live delete names no pair');

-- 2. Controls.
select pg_temp.as_user('p');
select is(public.set_account_controls(p_is_private => true),
  '{"is_private": true, "posts_visibility": "followers", "tag_permission": "approve", "accepted_requests": 0}'::jsonb,
  'going private: workouts to everyone become workouts to followers');
reset role;
select ok((select privacy_chosen_at is not null from public.profiles where id = pg_temp.uid('p')),
  'the choice is stamped');
select ok(pg_temp.follows('f', 'p'), 'going private keeps the people who already follow');
select pg_temp.as_user('p');
select throws_ok($$select public.set_account_controls(null, 'strangers')$$,
  '22023', 'that setting is not allowed', 'an unknown workouts setting is refused');
select throws_ok($$select public.set_account_controls(null, null, 'nobody')$$,
  '22023', 'that setting is not allowed', 'an unknown tag setting is refused');
select is(public.set_account_controls(null, 'everyone') ->> 'posts_visibility', 'followers',
  'everyone is not allowed while private');

-- 3. A request.
select pg_temp.as_user('a');
select is((select row(status, is_following, is_private)::text
           from public.set_following(pg_temp.uid('p'), true)),
  '(requested,f,t)', 'following a private account sends a request');
reset role;
select ok(not pg_temp.follows('a', 'p') and pg_temp.requested('a', 'p'),
  'a request, not a follow');
select is(pg_temp.notes('p', 'a', 'follow_request'), 1, 'p is told once');
select is((select o.body from public.push_outbox o join public.notifications n
             on o.dedupe_key = 'notification:' || n.id
           where n.user_id = pg_temp.uid('p') and n.actor_id = pg_temp.uid('a')
             and n.type = 'follow_request'),
  '@pa_a wants to follow you', 'the request push');
select is((select o.data ->> 'route' from public.push_outbox o join public.notifications n
             on o.dedupe_key = 'notification:' || n.id
           where n.user_id = pg_temp.uid('p') and n.actor_id = pg_temp.uid('a')
             and n.type = 'follow_request'),
  'notifications', 'the request push opens notifications');
update public.follow_requests set created_at = now() - interval '1 hour'
where requester_id = pg_temp.uid('a');
select pg_temp.as_user('a');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested',
  'asking twice still says requested');
reset role;
select ok((select count(*) = 1 and min(created_at) < now() from public.follow_requests
           where requester_id = pg_temp.uid('a'))
          and pg_temp.notes('p', 'a', 'follow_request') = 1,
  'asking twice keeps one request, its time, and one notice');
select pg_temp.as_user('a');
select is((select row(is_following, requested, is_private)::text
           from public.get_follow_data(pg_temp.uid('c'), pg_temp.uid('p'))),
  '(f,t,t)', 'get_follow_data answers for the caller, whatever id is passed');
select is((select count(*)::int from public.follow_requests), 1, 'the requester sees their request');
select pg_temp.as_user('c');
select is((select requested from public.get_follow_data(pg_temp.uid('a'), pg_temp.uid('p'))), false,
  'another person''s id is ignored');
select is((select count(*)::int from public.follow_requests), 0, 'a stranger sees no requests');
select is((select count(*)::int from public.get_follow_requests()), 0, 'a stranger''s list is their own');
select pg_temp.as_user('p');
select is((select string_agg(username, ',') from public.get_follow_requests()), 'pa_a',
  'p sees the request');

-- 4. Cancel, ask again.
select pg_temp.as_user('a');
select is((select status from public.set_following(pg_temp.uid('p'), false)), 'none',
  'tapping Requested cancels');
reset role;
select ok(not pg_temp.requested('a', 'p') and pg_temp.notes('p', 'a', 'follow_request') = 0,
  'cancelling removes the request and its notice');
select pg_temp.as_user('a');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested',
  'asking again');
reset role;
select is(pg_temp.notes('p', 'a', 'follow_request'), 0, 'asking again the same day does not notify again');

-- 5. Accept.
select pg_temp.as_user('p');
select is(public.respond_follow_request(pg_temp.uid('a'), true),
  '{"status": "accepted", "follow_back": null}'::jsonb, 'p accepts');
reset role;
select ok(pg_temp.follows('a', 'p') and not pg_temp.requested('a', 'p'),
  'a follows p now and the request is gone');
select is(pg_temp.notes('a', 'p', 'follow_accepted'), 1, 'a is told');
select is((select o.body from public.push_outbox o join public.notifications n
             on o.dedupe_key = 'notification:' || n.id
           where n.user_id = pg_temp.uid('a') and n.type = 'follow_accepted'),
  '@pa_p accepted your follow request', 'the accepted push');
select is((select o.data ->> 'route' from public.push_outbox o join public.notifications n
             on o.dedupe_key = 'notification:' || n.id
           where n.user_id = pg_temp.uid('a') and n.type = 'follow_accepted'),
  'profile', 'the accepted push opens the profile');
select is(pg_temp.notes('p', 'a', 'follow'), 0, 'no started-following notice on approval');
select pg_temp.as_user('p');
select is(public.respond_follow_request(pg_temp.uid('a'), true) ->> 'status', 'accepted',
  'accepting twice gives the same answer');
reset role;
select is(pg_temp.notes('a', 'p', 'follow_accepted'), 1, 'and tells nobody twice');

-- 6. Decline.
select pg_temp.as_user('b');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested', 'b asks');
select pg_temp.as_user('p');
select is(public.respond_follow_request(pg_temp.uid('b'), false) ->> 'status', 'declined', 'p deletes it');
reset role;
select ok(not pg_temp.follows('b', 'p') and not pg_temp.requested('b', 'p')
          and pg_temp.notes('b', 'p', 'follow_accepted') = 0
          and pg_temp.notes('p', 'b', 'follow_request') = 0,
  'deleting is silent and leaves nothing behind');
select pg_temp.as_user('p');
select is(public.respond_follow_request(pg_temp.uid('b'), true) ->> 'status', 'gone',
  'a deleted request cannot be accepted after');

-- 7. Accept after a cancel.
select pg_temp.as_user('b');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested', 'b asks again');
select is((select status from public.set_following(pg_temp.uid('p'), false)), 'none', 'and cancels');
select pg_temp.as_user('p');
select is(public.respond_follow_request(pg_temp.uid('b'), true) ->> 'status', 'gone',
  'accepting a request already cancelled does nothing');
reset role;
select ok(not pg_temp.follows('b', 'p'), 'and makes no follow');

-- 8. Accept and follow back.
select pg_temp.as_user('b');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested', 'b asks once more');
select pg_temp.as_user('p');
select is(public.respond_follow_request(pg_temp.uid('b'), true, true),
  '{"status": "accepted", "follow_back": "following"}'::jsonb, 'accept and follow back in one go');
reset role;
select ok(public.are_friends(pg_temp.uid('p'), pg_temp.uid('b')), 'they are friends now');

-- 9. Only the person asked can answer.
select pg_temp.as_user('c');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested', 'c asks');
select pg_temp.as_user('a');
select is(public.respond_follow_request(pg_temp.uid('c'), true) ->> 'status', 'gone',
  'someone else cannot answer p''s request');
reset role;
select ok(pg_temp.requested('c', 'p') and not pg_temp.follows('c', 'p'), 'p''s request is untouched');

-- 9b. Follow back only when the request is accepted.
select pg_temp.as_user('m');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested', 'm asks');
select pg_temp.as_user('p');
select is(public.respond_follow_request(pg_temp.uid('m'), false, true),
  '{"status": "declined", "follow_back": null}'::jsonb, 'deleting with follow back ticked follows nobody');
select is(public.respond_follow_request(pg_temp.uid('m'), true, true),
  '{"status": "gone", "follow_back": null}'::jsonb, 'nor does answering a request that is gone');
reset role;
select ok(not pg_temp.follows('p', 'm') and not pg_temp.follows('m', 'p'), 'no follow either way');

-- 10. Banned requesters.
insert into public.follow_requests (requester_id, target_id) values (pg_temp.uid('e'), pg_temp.uid('p'));
select pg_temp.as_user('p');
select ok(not exists (select 1 from public.get_follow_requests() where requester_id = pg_temp.uid('e')),
  'a banned requester is hidden');
select is(public.respond_follow_request(pg_temp.uid('e'), true) ->> 'status', 'gone',
  'a banned requester cannot be accepted');
reset role;
select ok(not pg_temp.follows('e', 'p'), 'and does not follow');

-- 11. Blocks and bans clear requests.
select pg_temp.as_user('d');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested', 'd asks');
reset role;
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.uid('p'), pg_temp.uid('d'));
select ok(not pg_temp.requested('d', 'p'), 'a block clears the request');
select pg_temp.as_user('h');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested', 'h asks');
reset role;
select public.sanction_user('ban', pg_temp.uid('h'), 'spam', null, null);
select ok(not pg_temp.requested('h', 'p'), 'a ban removes the person''s requests');
select is((select count(*)::int from public.push_outbox
           where user_id = pg_temp.uid('p') and kind = 'follow_request'
             and data ->> 'user_id' = pg_temp.uid('h')::text and sent_at is null), 0,
  'and the request push not yet sent');

-- 12. Going public accepts every pending request (c and i), in one go.
select pg_temp.as_user('i');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'requested', 'i asks');
select pg_temp.as_user('p');
select is(public.set_account_controls(p_is_private => false) ->> 'accepted_requests', '2',
  'going public accepts every pending request');
reset role;
select ok(pg_temp.follows('c', 'p') and pg_temp.follows('i', 'p')
          and not exists (select 1 from public.follow_requests where target_id = pg_temp.uid('p')),
  'they follow p now and nothing is waiting');
select is(pg_temp.notes('c', 'p', 'follow_accepted') + pg_temp.notes('i', 'p', 'follow_accepted'), 2,
  'each is told');
select is(pg_temp.notes('p', 'c', 'follow') + pg_temp.notes('p', 'i', 'follow'), 0,
  'no started-following flood');
select is((select count(*)::int from public.notifications
           where user_id = pg_temp.uid('p') and type = 'follow_request'), 0,
  'the request notices are gone');
select pg_temp.as_user('j');
select is((select status from public.set_following(pg_temp.uid('p'), true)), 'following',
  'a public account is followed straight away');

-- 13. The daily cap: 100 new requests a day.
reset role;
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000009a02' || lpad(n::text, 2, '0'))::uuid, 'cap' || n || '@example.invalid'
from generate_series(0, 99) n;
insert into public.profiles (id, username)
select ('00000000-0000-0000-0000-0000009a02' || lpad(n::text, 2, '0'))::uuid, 'pa_cap' || n
from generate_series(0, 99) n;
insert into public.follow_request_notices (requester_id, target_id, notified_at)
select pg_temp.uid('k'), ('00000000-0000-0000-0000-0000009a02' || lpad(n::text, 2, '0'))::uuid, now()
from generate_series(0, 99) n;
select pg_temp.as_user('p');
select lives_ok($$select public.set_account_controls(true)$$, 'p goes private again');
select pg_temp.as_user('k');
select throws_ok($$select * from public.set_following(pg_temp.uid('p'), true)$$,
  '22023', 'too many follow requests today', 'past 100 new requests a day, no more');

-- 14. Removing a follower.
reset role;
insert into public.tag_challenges (tagger_id, tagged_id, expires_at, started_at) values
  (pg_temp.uid('p'), pg_temp.uid('g'), now() + interval '48 hours', now()),
  (pg_temp.uid('g'), pg_temp.uid('p'), now() + interval '48 hours', now());
select pg_temp.as_user('p');
select is(public.remove_follower(pg_temp.uid('f')), '{"removed": true, "tags_ended": 0}'::jsonb,
  'removing a follower');
reset role;
select ok(not pg_temp.follows('f', 'p')
          and not exists (select 1 from public.notifications where user_id = pg_temp.uid('f')),
  'f no longer follows and is not told');
select pg_temp.as_user('p');
select is(public.remove_follower(pg_temp.uid('g')), '{"removed": true, "tags_ended": 2}'::jsonb,
  'removing a friend ends the open tags both ways');
reset role;
select ok(pg_temp.follows('p', 'g') and not pg_temp.follows('g', 'p')
          and not exists (select 1 from public.tag_challenges
                          where pg_temp.uid('g') in (tagger_id, tagged_id) and cancelled_at is null),
  'p still follows g; the tags are cancelled');
select pg_temp.as_user('p');
select is(public.remove_follower(pg_temp.uid('f')) ->> 'removed', 'false',
  'removing someone who doesn''t follow you does nothing');

-- 15. Signed out.
select pg_temp.signed_out();
select throws_ok($$select public.respond_follow_request(pg_temp.uid('a'), true)$$,
  '42501', 'not signed in', 'signed out: no answering requests');
select throws_ok($$select public.remove_follower(pg_temp.uid('a'))$$,
  '42501', 'not signed in', 'signed out: no removing followers');
select throws_ok($$select * from public.get_follow_requests()$$,
  '42501', 'not signed in', 'signed out: no request list');
select throws_ok($$select public.set_account_controls(true)$$,
  '42501', 'not signed in', 'signed out: no controls');
select throws_ok($$select * from public.get_follow_data(pg_temp.uid('a'), pg_temp.uid('p'))$$,
  '42501', 'not signed in', 'signed out: no follow data');
reset role;
select ok(not has_function_privilege('anon', 'public.respond_follow_request(uuid, boolean, boolean)', 'execute')
          and not has_function_privilege('anon', 'public.remove_follower(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.get_follow_requests()', 'execute')
          and not has_function_privilege('anon', 'public.set_account_controls(boolean, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.get_follow_data(uuid, uuid)', 'execute')
          and not has_function_privilege('anon', 'public.set_following(uuid, boolean)', 'execute')
          and not has_function_privilege('anon', 'public.can_see_follow_lists(uuid)', 'execute'),
  'none of them is callable signed out');
select ok(has_function_privilege('authenticated', 'public.respond_follow_request(uuid, boolean, boolean)', 'execute')
          and has_function_privilege('authenticated', 'public.remove_follower(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.get_follow_requests()', 'execute')
          and has_function_privilege('authenticated', 'public.set_account_controls(boolean, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.effective_posts_visibility(uuid)', 'execute'),
  'signed in can call them; the visibility helper is internal');

-- 16. Lists. p is private again; a, b, c, i, j follow p; p and j follow g (public).
reset role;
insert into public.follows (follower_id, following_id) values (pg_temp.uid('j'), pg_temp.uid('g'));
select pg_temp.as_user('m');
select is((select count(*)::int from public.follows where following_id = pg_temp.uid('p')), 0,
  'a stranger cannot read a private account''s followers');
select is((select count(*)::int from public.get_friends(pg_temp.uid('p'))), 0,
  'nor its friends');
select is((select follower_count::int from public.get_follow_data(pg_temp.uid('m'), pg_temp.uid('p'))), 5,
  'the counts still show');
select is((select count(*)::int from public.follows where following_id = pg_temp.uid('g')), 1,
  'anyone can read a public account''s lists');
select is((select count(*)::int from public.follows where follower_id = pg_temp.uid('p')), 0,
  'but not the rows of a private account in them');
select pg_temp.as_user('a');
select is((select count(*)::int from public.follows where following_id = pg_temp.uid('p')), 5,
  'an approved follower can read them');
select is((select string_agg(username, ',') from public.get_friends(pg_temp.uid('p'))), 'pa_b',
  'and the friends list');
select pg_temp.as_user('p');
select is((select count(*)::int from public.follows where following_id = pg_temp.uid('p')), 5,
  'the owner reads their own');

select * from finish();
rollback;
