-- Someone joins Mahi from a tag link (core workflow, 2026-10-09): the tagger's push reads
-- "Joe joined Mahi from your tag 🎉" — first name, else display name, else @username. A general
-- invite link keeps its two wordings.
-- Migration: 20261009100000_first_post_tag_and_post_points.
begin;
select plan(9);

update public.app_config set tags_required = true, tag_count = 3, invite_links_enabled = true,
  feed_lock_enabled = false, quiet_start = '00:00', quiet_end = '00:00',
  max_open_invites = 10;

-- i, k, l post with a tag link; g (public) and h (private) send general links. p, q, r, u, w join.
-- s is a stranger.
create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000001f04' || lpad((ascii(p) - 96)::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email)
select pg_temp.uid(c), 'tjp-' || c || '@example.invalid'
from unnest(array['i','k','l','g','h','p','q','r','u','w','s']) c;
insert into public.profiles (id, username, timezone)
select pg_temp.uid(c), 'tjp_' || c, 'Europe/London'
from unnest(array['i','k','l','g','h','p','q','r','u','w','s']) c;
update public.profiles set first_name = 'Joe', display_name = 'Joe Bloggs' where id = pg_temp.uid('p');
update public.profiles set display_name = 'Quinn Q' where id = pg_temp.uid('q');
update public.profiles set is_private = true where id = pg_temp.uid('h');
insert into storage.objects (bucket_id, name)
select 'posts', pg_temp.uid(u)::text || '/1.jpg' from unnest(array['i','k','l']) u;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', pg_temp.uid(u), 'role', 'authenticated')::text, true);
$$;
create table pg_temp.ids (name text primary key, val text);
grant all on pg_temp.ids to authenticated;
-- u posts with one tag link; its token is kept under u's name.
create function pg_temp.post_with_link(u text) returns void language plpgsql as $$
declare
  v jsonb;
begin
  perform pg_temp.as_user(u);
  v := public.make_invite_link();
  insert into pg_temp.ids values (u, v ->> 'token');
  perform public.create_post(gen_random_uuid(), pg_temp.uid(u)::text || '/1.jpg',
    p_slot_ids => array[(v ->> 'challenge_id')::uuid]);
end;
$$;
create function pg_temp.claim(u text, p_inviter text) returns jsonb language plpgsql as $$
begin
  perform pg_temp.as_user(u);
  return public.claim_invite((select val from pg_temp.ids where name = p_inviter));
end;
$$;
create function pg_temp.push(p_to text) returns text language sql as $$
  select o.body from public.push_outbox o
  join public.notifications n on o.dedupe_key = 'notification:' || n.id
  where n.user_id = pg_temp.uid(p_to) and n.type = 'invite_joined'
  order by n.created_at desc limit 1
$$;

-- 1. Tag links: the joiner's first name, else display name, else @username.
select pg_temp.post_with_link('i');
select pg_temp.post_with_link('k');
select pg_temp.post_with_link('l');
reset role;
select lives_ok($$select pg_temp.claim('p', 'i')$$, 'Joe joins from i''s tag');
reset role;
select is(pg_temp.push('i'), 'Joe joined Mahi from your tag 🎉', 'the push names him by first name');
select lives_ok($$select pg_temp.claim('q', 'k')$$, 'Quinn, with no first name, joins from k''s tag');
reset role;
select is(pg_temp.push('k'), 'Quinn Q joined Mahi from your tag 🎉', 'no first name: the display name');
select pg_temp.claim('r', 'l');
reset role;
select is(pg_temp.push('l'), '@tjp_r joined Mahi from your tag 🎉', 'no name at all: the username');

-- 2. General invite links keep their wording.
select pg_temp.as_user('g');
insert into pg_temp.ids select 'g', public.make_mate_invite() ->> 'token';
select pg_temp.as_user('h');
insert into pg_temp.ids select 'h', public.make_mate_invite() ->> 'token';
select pg_temp.claim('u', 'g');
select pg_temp.claim('w', 'h');
reset role;
select is(pg_temp.push('g'), '@tjp_u joined Mahi from your invite. You follow each other now.',
  'a general link from a public account: follow each other');
select is(pg_temp.push('h'), '@tjp_w joined Mahi from your invite and wants to follow you.',
  'a general link from a private account: a follow request');

-- 3. The push queue stays closed to the app.
select pg_temp.as_user('s');
select throws_ok($$select count(*) from public.push_outbox$$, '42501', null,
  'a signed-in stranger cannot read the push queue');
reset role;
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select count(*) from public.push_outbox$$, '42501', null,
  'nor can someone signed out');
reset role;

select * from finish();
rollback;
