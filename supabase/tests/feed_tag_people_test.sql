-- Who a post answered and who it invited (core workflow, 2026-10-09). Every feed item (feed_item)
-- gains:
--   answered_taggers [{user_id, username}]  every tag the post answered, oldest first
--   pending_invites  [{initials}]           link slots on the post nobody has joined from yet
-- Initials only: never the name, number, token, code or slot id. Both are empty for a viewer the
-- feed lock hides the post from, and a viewer who can't see the post gets nothing.
-- Migration: 20261009100000_first_post_tag_and_post_points.
begin;
select plan(20);

update public.app_config set tags_required = true, tag_count = 3, invite_links_enabled = true,
  feed_lock_enabled = false, quiet_start = '00:00', quiet_end = '00:00',
  max_open_invites = 10;

-- o posts; a and b tagged o (a first), later c; v follows o; s is a stranger; n joins from a link.
create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000001f03' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'ftp-' || c || '@example.invalid' from unnest(array['o','a','b','c','v','s','n']) c;
insert into public.profiles (id, username, timezone)
select pg_temp.uid(c), 'ftp_' || c, 'Europe/London' from unnest(array['o','a','b','c','v','s','n']) c;
insert into public.follows (follower_id, following_id) values (pg_temp.uid('v'), pg_temp.uid('o'));
insert into storage.objects (bucket_id, name)
select 'posts', pg_temp.uid('o')::text || '/' || n || '.jpg' from generate_series(1, 2) n;
insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at) values
  (pg_temp.uid('a'), pg_temp.uid('o'), now() - interval '2 hours', now() - interval '2 hours', now() + interval '46 hours'),
  (pg_temp.uid('b'), pg_temp.uid('o'), now() - interval '1 hour', now() - interval '1 hour', now() + interval '47 hours');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(u), 'role', 'authenticated')::text, true);
$$;
create table pg_temp.ids (name text primary key, val text);
grant all on pg_temp.ids to authenticated;
create function pg_temp.id(p text) returns text language sql as $$
  select val from pg_temp.ids where name = p
$$;
-- A link slot for o, sent to someone (or nobody named).
create function pg_temp.link(p_name text, p_label text) returns void language plpgsql as $$
declare
  v jsonb;
begin
  perform pg_temp.as_user('o');
  v := public.make_invite_link();
  insert into pg_temp.ids values (p_label, v ->> 'challenge_id'), (p_label || '_token', v ->> 'token'),
    (p_label || '_code', v ->> 'code');
  if p_name is not null then
    perform public.record_invite_sent(v ->> 'token', 'contact', p_name, '+447700900123');
  end if;
end;
$$;
-- The feed item for one of o's posts, as the viewer sees it on o's profile (null if not shown).
create function pg_temp.item(u text, p_label text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform pg_temp.as_user(u);
  select e into v from jsonb_array_elements(public.get_user_posts(pg_temp.uid('o')) -> 'items') e
  where e ->> 'id' = pg_temp.id(p_label);
  return v;
end;
$$;

-- 1. o's first post answers a's and b's tags and fills one link slot, sent to Sam Lee.
select pg_temp.link('Sam Lee', 'l1');
insert into pg_temp.ids
select 'p1', public.create_post(gen_random_uuid(), pg_temp.uid('o')::text || '/1.jpg',
  p_slot_ids => array[pg_temp.id('l1')::uuid]) -> 'post' ->> 'id';
reset role;
select is(pg_temp.item('v', 'p1') -> 'answered_taggers',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.uid('a'), 'username', 'ftp_a'),
                    jsonb_build_object('user_id', pg_temp.uid('b'), 'username', 'ftp_b')),
  'both taggers, oldest first');
reset role;
select is(pg_temp.item('v', 'p1') -> 'answered' ->> 'tagger_username', 'ftp_a',
  'the old answered field stays for older apps');
reset role;
select is(pg_temp.item('v', 'p1') -> 'pending_invites', '[{"initials": "SL"}]'::jsonb,
  'Sam Lee shows as SL');
reset role;
select ok(pg_temp.item('v', 'p1')::text not like '%Sam Lee%', 'the name never appears');
reset role;
select ok(pg_temp.item('v', 'p1')::text not like '%7700900123%', 'nor the number');
reset role;
select ok(position(pg_temp.id('l1_token') in pg_temp.item('v', 'p1')::text) = 0
          and position(pg_temp.id('l1_code') in pg_temp.item('v', 'p1')::text) = 0,
  'nor the link token or code');
reset role;
select ok(position(pg_temp.id('l1') in pg_temp.item('v', 'p1')::text) = 0, 'nor the slot id');
reset role;

-- 2. Sam joins: the circle goes, the real person is tagged.
select pg_temp.as_user('n');
select lives_ok($$select public.claim_invite(pg_temp.id('l1_token'))$$, 'n joins from the link');
reset role;
select ok(pg_temp.item('v', 'p1') -> 'tagged_users' @> '[{"username": "ftp_n"}]'::jsonb,
  'n is now in the tagged people');
reset role;
select is(pg_temp.item('v', 'p1') -> 'pending_invites', '[]'::jsonb, 'and no longer pending');
reset role;

-- 3. A banned tagger is left out.
update public.profiles set is_banned = true where id = pg_temp.uid('b');
select is(pg_temp.item('v', 'p1') -> 'answered_taggers',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.uid('a'), 'username', 'ftp_a')),
  'a banned tagger is not listed');
reset role;
update public.profiles set is_banned = false where id = pg_temp.uid('b');

-- 4. o's answer to c: three link slots, one named "ann", one unnamed, one "Bo Di Ke".
insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at)
values (pg_temp.uid('c'), pg_temp.uid('o'), now(), now(), now() + interval '48 hours');
select pg_temp.link('ann', 'l2');
select pg_temp.link(null, 'l3');
select pg_temp.link('Bo Di Ke', 'l4');
insert into pg_temp.ids
select 'p2', public.create_post(gen_random_uuid(), pg_temp.uid('o')::text || '/2.jpg',
  p_slot_ids => array[pg_temp.id('l2')::uuid, pg_temp.id('l3')::uuid, pg_temp.id('l4')::uuid])
  -> 'post' ->> 'id';
reset role;
select is((select jsonb_agg(e order by e::text) from jsonb_array_elements(pg_temp.item('v', 'p2') -> 'pending_invites') e),
  '[{"initials": "A"}, {"initials": "BK"}, {"initials": null}]'::jsonb,
  'one letter for one word, first and last for more, null for no name');
reset role;
select is(pg_temp.item('v', 'p2') -> 'answered_taggers',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.uid('c'), 'username', 'ftp_c')),
  'the answer lists its tagger');
reset role;

-- 5. A link that ran out or was taken back is gone.
update public.invites set expires_at = now() - interval '1 minute' where token = pg_temp.id('l3_token');
select pg_temp.as_user('o');
select lives_ok($$select public.cancel_invite(pg_temp.id('l4_token'))$$, 'o takes one link back');
reset role;
select is(pg_temp.item('v', 'p2') -> 'pending_invites', '[{"initials": "A"}]'::jsonb,
  'only the live link is pending');
reset role;

-- 6. A locked viewer gets neither field.
update public.app_config set feed_lock_enabled = true;
select is(pg_temp.item('v', 'p2') ->> 'locked', 'true', 'v has not posted, so the post is locked');
reset role;
select is(pg_temp.item('v', 'p2') -> 'answered_taggers', '[]'::jsonb, 'no taggers when locked');
reset role;
select is(pg_temp.item('v', 'p2') -> 'pending_invites', '[]'::jsonb, 'no invites when locked');
reset role;

-- 7. A stranger who can't see o's posts gets nothing for them.
update public.app_config set feed_lock_enabled = false;
select pg_temp.as_user('s');
select is(public.get_user_posts(pg_temp.uid('o')) -> 'items', '[]'::jsonb,
  'a stranger gets no posts, so no taggers or invites');
select throws_ok($$select public.name_initials('Sam Lee')$$, '42501', null,
  'the app cannot call the initials helper');
reset role;

select * from finish();
rollback;
