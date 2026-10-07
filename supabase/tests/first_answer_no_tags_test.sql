-- A first post that answers a mate's tag needs no tags (owner, 2026-10-07): tagging is
-- encouraged, not required. Every other post keeps the rule: a free first post with no tag to
-- answer, and every post after the first, still tag 3. Migration: 20261007190000_first_answer_no_tags.
begin;
select plan(7);

update public.app_config set tags_required = true, tag_count = 3, invite_links_enabled = true,
  quiet_start = '00:00', quiet_end = '00:00';

-- A was tagged by T and has never posted. B came alone. C's only tag ran out. T tags.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000fa101', 'fant-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000fa102', 'fant-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000fa103', 'fant-c@example.invalid'),
  ('00000000-0000-0000-0000-0000000fa104', 'fant-t@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000fa101', 'fant_a', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fa102', 'fant_b', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fa103', 'fant_c', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000fa104', 'fant_t', 'Europe/London');
insert into storage.objects (bucket_id, name)
select 'posts', '00000000-0000-0000-0000-0000000fa10' || u || '/' || n || '.jpg'
from generate_series(1, 3) u, generate_series(1, 3) n;

create function pg_temp.post(u int, n int) returns jsonb language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000fa10' || u || '","role":"authenticated"}', true);
  return public.create_post(('77777777-0000-0000-0000-0000000000' || u || n)::uuid,
    '00000000-0000-0000-0000-0000000fa10' || u || '/' || n || '.jpg', null, null, '{}'::uuid[]);
end;
$$;
-- T tags someone; `ago` moves the tag into the past (48 hours from then).
create function pg_temp.tag(p_to int, ago interval default '0') returns void language sql as $$
  insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at)
  values ('00000000-0000-0000-0000-0000000fa104', ('00000000-0000-0000-0000-0000000fa10' || p_to)::uuid,
          now() - ago, now() - ago, now() - ago + interval '48 hours');
$$;

-- 1. A mate tagged A: A's first post answers it with no tags at all.
select pg_temp.tag(1);
select lives_ok($$select pg_temp.post(1, 1)$$, 'a first post that answers a tag may tag nobody');
reset role;
select is((select count(*)::int from public.posts where user_id = '00000000-0000-0000-0000-0000000fa101'), 1,
  'the post is made');
select ok((select answered_at is not null from public.tag_challenges
           where tagged_id = '00000000-0000-0000-0000-0000000fa101'),
  'and it answers the mate''s tag');
select is((select streak_current from public.profiles where id = '00000000-0000-0000-0000-0000000fa101'), 1,
  'and earns the first point');

-- 2. After that, every post tags 3 again.
select pg_temp.tag(1);
select throws_ok($$select pg_temp.post(1, 2)$$, '22023', 'tag or invite 3 people',
  'a later answer with no tags is refused');
reset role;

-- 3. B came alone: the free first post still tags 3.
select throws_ok($$select pg_temp.post(2, 1)$$, '22023', 'tag or invite 3 people',
  'a free first post with no tag to answer still needs 3 tags');
reset role;

-- 4. C's only tag ran out (past the grace): nothing to answer, so 3 tags.
select pg_temp.tag(3, interval '49 hours');
select throws_ok($$select pg_temp.post(3, 1)$$, '22023', 'tag or invite 3 people',
  'a first post whose tag ran out still needs 3 tags');
reset role;

select * from finish();
rollback;
