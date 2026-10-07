-- Your first post earns your first Mahi point (Maximus, 2026-10-07), whether it is a free first
-- post or the answer to a mate's tag; never 2 for both. Migration: 20261007180000_first_post_point.
begin;
select plan(6);

update public.app_config set tags_required = false, quiet_start = '00:00', quiet_end = '00:00';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f9a01', 'fpp-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000f9a02', 'fpp-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000f9a03', 'fpp-c@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000f9a01', 'fpp_a', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000f9a02', 'fpp_b', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000f9a03', 'fpp_c', 'Europe/London');
insert into storage.objects (bucket_id, name)
select 'posts', '00000000-0000-0000-0000-0000000f9a0' || u || '/' || n || '.jpg'
from generate_series(1, 2) u, generate_series(1, 3) n;

create function pg_temp.post(u int, n int) returns jsonb language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000f9a0' || u || '","role":"authenticated"}', true);
  return public.create_post(('66666666-0000-0000-0000-0000000000' || u || n)::uuid,
    '00000000-0000-0000-0000-0000000f9a0' || u || '/' || n || '.jpg', null, null, '{}'::uuid[]);
end;
$$;
create function pg_temp.tag(p_to int) returns void language sql as $$
  insert into public.tag_challenges (tagger_id, tagged_id, created_at, expires_at)
  values ('00000000-0000-0000-0000-0000000f9a03', ('00000000-0000-0000-0000-0000000f9a0' || p_to)::uuid,
          now(), now() + interval '48 hours');
$$;

-- 1. A downloaded Mahi themselves: the free first post earns the first point.
select is(pg_temp.post(1, 1) -> 'streak',
  '{"streak_current": 1, "streak_highest": 1}'::jsonb,
  'a free first post earns your first Mahi point');
reset role;
select is((select streak_day from public.posts where client_id = '66666666-0000-0000-0000-000000000011'), 1,
  'the first post records point 1');

-- 2. After that, still only by answering a tag.
select throws_ok($$select pg_temp.post(1, 2)$$, 'P0001', 'reactive posting: not tagged',
  'a second post with no tag is still refused');
reset role;
select pg_temp.tag(1);
select is((pg_temp.post(1, 3) -> 'streak' ->> 'streak_current')::int, 2,
  'answering a tag after that adds 1 more');
reset role;

-- 3. B came from a mate: their first post answers the tag and earns 1, not 2.
select pg_temp.tag(2);
select is((pg_temp.post(2, 1) -> 'streak' ->> 'streak_current')::int, 1,
  'a first post that answers a tag earns 1 point, not 2');
reset role;
select is((select streak_highest from public.profiles where id = '00000000-0000-0000-0000-0000000f9a02'), 1,
  'the best is 1 as well');

select * from finish();
rollback;
