-- An answer can tag back (Maximus, 2026-10-07, option A): when you answer @sam's tag, @sam can be
-- one of your mates, so two mates can keep each other going. Your own open tag on someone still
-- stops you tagging them again. Migration: 20261007240000_tag_back.
begin;
select plan(5);

update public.app_config set tags_required = false, quiet_start = '00:00', quiet_end = '00:00';

-- S and A follow each other. S tagged A; A answers and tags S back.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000fb101', 'tb-s@example.invalid'),
  ('00000000-0000-0000-0000-0000000fb102', 'tb-a@example.invalid');
insert into public.profiles (id, username, timezone, has_posted_before) values
  ('00000000-0000-0000-0000-0000000fb101', 'tb_s', 'Europe/London', true),
  ('00000000-0000-0000-0000-0000000fb102', 'tb_a', 'Europe/London', true);
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-0000000fb101', '00000000-0000-0000-0000-0000000fb102'),
  ('00000000-0000-0000-0000-0000000fb102', '00000000-0000-0000-0000-0000000fb101');
insert into storage.objects (bucket_id, name) values
  ('posts', '00000000-0000-0000-0000-0000000fb102/1.jpg'),
  ('posts', '00000000-0000-0000-0000-0000000fb102/2.jpg');
insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at)
values ('00000000-0000-0000-0000-0000000fb101', '00000000-0000-0000-0000-0000000fb102',
        now(), now(), now() + interval '48 hours');

create function pg_temp.post_a(n int, tags uuid[]) returns jsonb language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000fb102","role":"authenticated"}', true);
  return public.create_post(('88888888-0000-0000-0000-00000000000' || n)::uuid,
    '00000000-0000-0000-0000-0000000fb102/' || n || '.jpg', null, null, tags);
end;
$$;

select is((select has_open_tag from public.taggable_friends('00000000-0000-0000-0000-0000000fb102')
           where id = '00000000-0000-0000-0000-0000000fb101'), false,
  'a mate whose tag on you is open can be tagged back');

select lives_ok($$select pg_temp.post_a(1, array['00000000-0000-0000-0000-0000000fb101']::uuid[])$$,
  'answering @sam can tag @sam back');
reset role;
select ok((select answered_at is not null from public.tag_challenges
           where tagger_id = '00000000-0000-0000-0000-0000000fb101'
             and tagged_id = '00000000-0000-0000-0000-0000000fb102'),
  'S''s tag on A is answered');
select is((select count(*)::int from public.tag_challenges
           where tagger_id = '00000000-0000-0000-0000-0000000fb102'
             and tagged_id = '00000000-0000-0000-0000-0000000fb101'
             and answered_at is null), 1,
  'and S now has A''s tag to answer: the chain keeps going');

-- Your own open tag on S still stops you tagging S again until S answers.
select is((select has_open_tag from public.taggable_friends('00000000-0000-0000-0000-0000000fb102')
           where id = '00000000-0000-0000-0000-0000000fb101'), true,
  'your own open tag on a mate still blocks tagging them again');

select * from finish();
rollback;
