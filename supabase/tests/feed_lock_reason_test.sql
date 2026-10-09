-- The feed read says why it is locked (owner, 2026-10-09: "if it's locked it'll know surely?"):
-- get_feed also returns your own open tags and whether you have posted before, so the locked
-- panel never waits on a second read. Only the caller's own tags; a stranger's never appear.
-- Migration: 20261009120000_feed_lock_reason.
begin;
select plan(7);

update public.app_config set feed_lock_enabled = true, quiet_start = '00:00', quiet_end = '00:00';

-- V is the viewer; T tagged V; S is a stranger tagged by T.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f1a01', 'flr-v@example.invalid'),
  ('00000000-0000-0000-0000-0000000f1a02', 'flr-t@example.invalid'),
  ('00000000-0000-0000-0000-0000000f1a03', 'flr-s@example.invalid');
insert into public.profiles (id, username, has_posted_before) values
  ('00000000-0000-0000-0000-0000000f1a01', 'flr_v', true),
  ('00000000-0000-0000-0000-0000000f1a02', 'flr_t', true),
  ('00000000-0000-0000-0000-0000000f1a03', 'flr_s', false);
insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at) values
  ('00000000-0000-0000-0000-0000000f1a02', '00000000-0000-0000-0000-0000000f1a01',
   now(), now(), now() + interval '48 hours'),
  ('00000000-0000-0000-0000-0000000f1a02', '00000000-0000-0000-0000-0000000f1a03',
   now(), now(), now() + interval '40 hours');

create function pg_temp.feed_as(u uuid) returns jsonb language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  return public.get_feed(20, null, null);
end;
$$;

create temp table r as select pg_temp.feed_as('00000000-0000-0000-0000-0000000f1a01') as f;
reset role;

select is((select jsonb_array_length(f -> 'open_tags') from r), 1, 'the feed read carries my open tag');
select is((select f -> 'open_tags' -> 0 ->> 'username' from r), 'flr_t', 'with who tagged me');
select ok((select (f -> 'open_tags' -> 0 ->> 'expires_at') is not null from r), 'and when it runs out');
select is((select (f ->> 'posted_before')::boolean from r), true, 'and whether I have posted before');
select ok((select f::text not like '%flr_s%' from r), 'a stranger''s tag never appears');

-- Someone with no tags gets an empty list, not null.
select is((select jsonb_array_length(pg_temp.feed_as('00000000-0000-0000-0000-0000000f1a02') -> 'open_tags')), 0,
  'no tags: an empty list');
reset role;

-- Signed out is refused.
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select public.get_feed(20, null, null)$$, '42501', null, 'signed out is refused');
reset role;

select * from finish();
rollback;
