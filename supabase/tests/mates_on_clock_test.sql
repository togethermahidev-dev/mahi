-- Mates on the clock (usability walkthrough, 2026-10-07). Migration: 20261007260000_mates_on_clock.
-- 1. get_mates_on_clock: the waiting camera names the mates whose 48 hours to answer you are
--    running, soonest first. Only your own started, open tags with a person on Mahi.
-- 2. A miss tells the person who missed only when it cost them points: at 0 points there is
--    nothing to lose, so no streak_lost row (and no push). Several tags missed at once are one
--    message. The tagger still hears about every miss.
begin;
select plan(14);

update public.app_config set tags_required = false, quiet_start = '00:00', quiet_end = '00:00';

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000ec0' || c || c)::uuid, 'oc-' || c || '@example.invalid'
from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) c;
insert into public.profiles (id, username, timezone, has_posted_before)
select ('00000000-0000-0000-0000-0000000ec0' || c || c)::uuid, 'oc_' || c, 'Europe/London', true
from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) c;

create function pg_temp.uid(p_who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000ec0' || p_who || p_who)::uuid
$$;
-- p_from's tag on p_to, ending in p_left (negative = already run out).
create function pg_temp.tag(p_from text, p_to text, p_left interval) returns uuid
language sql as $$
  insert into public.tag_challenges (tagger_id, tagged_id, created_at, started_at, expires_at)
  values (pg_temp.uid(p_from), pg_temp.uid(p_to), now() - interval '1 hour', now() - interval '1 hour',
          now() + p_left)
  returning id
$$;
create function pg_temp.as_user(p_who text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.uid(p_who), 'role', 'authenticated')::text, true);
end;
$$;

-- 1. A tagged B (31h left), C (40h left) and D (answered); A's slot for E hasn't started; F
--    tagged A (that's A's own tag to answer, not A's mates on the clock).
select pg_temp.tag('a', 'c', '40 hours');
select pg_temp.tag('a', 'b', '31 hours');
select pg_temp.tag('a', 'd', '20 hours');
update public.tag_challenges set answered_at = now()
where tagger_id = pg_temp.uid('a') and tagged_id = pg_temp.uid('d');
insert into public.tag_challenges (tagger_id, tagged_id, created_at)
values (pg_temp.uid('a'), pg_temp.uid('e'), now());
insert into public.tag_challenges (tagger_id, tagged_id, created_at)
values (pg_temp.uid('a'), null, now());
select pg_temp.tag('f', 'a', '10 hours');

select pg_temp.as_user('a');
select is((select array_agg(username order by expires_at) from public.get_mates_on_clock()),
  array['oc_b', 'oc_c'], 'your open tags, soonest first, by username');
select is((select username from public.get_mates_on_clock() limit 1), 'oc_b',
  'the soonest comes first without sorting');
select ok((select bool_and(server_now is not null and expires_at > server_now)
           from public.get_mates_on_clock()), 'each row carries its deadline and the server clock');
reset role;

select pg_temp.as_user('b');
select is((select count(*)::int from public.get_mates_on_clock()), 0,
  'someone you tagged doesn''t see your tag as their mates on the clock');
reset role;

select ok(has_function_privilege('authenticated', 'public.get_mates_on_clock()', 'execute'),
  'the app can read it');
select ok(not has_function_privilege('anon', 'public.get_mates_on_clock()', 'execute'),
  'signed-out callers cannot');

-- 2. Misses. C has 0 points and misses F's tag: F hears, C gets nothing.
update public.profiles set streak_current = 0, streak_highest = 4 where id = pg_temp.uid('c');
select pg_temp.tag('f', 'c', '-1 hour');
select public.mark_missed_tags();
select is((select count(*)::int from public.notifications
           where type = 'tag_missed' and user_id = pg_temp.uid('f') and actor_id = pg_temp.uid('c')), 1,
  'the tagger still hears about a miss at 0 points');
select is((select count(*)::int from public.notifications
           where type = 'streak_lost' and user_id = pg_temp.uid('c')), 0,
  'no "points back to 0" at 0 points');
select is((select count(*)::int from public.push_outbox
           where kind = 'streak_lost' and user_id = pg_temp.uid('c')), 0,
  'and no push about it');

-- D has 3 points and misses two tags in the same run: one message, best kept.
update public.profiles set streak_current = 3, streak_highest = 5 where id = pg_temp.uid('d');
select pg_temp.tag('e', 'd', '-2 hours');
select pg_temp.tag('f', 'd', '-1 hour');
select public.mark_missed_tags();
select is((select streak_current from public.profiles where id = pg_temp.uid('d')), 0,
  'a miss with points puts them back to 0');
select is((select count(*)::int from public.notifications
           where type = 'streak_lost' and user_id = pg_temp.uid('d')), 1,
  'two tags missed at once are one message');
select is((select actor_id from public.notifications
           where type = 'streak_lost' and user_id = pg_temp.uid('d')), pg_temp.uid('e'),
  'naming the tag that ran out first');

-- B has 2 points; B's miss is marked by someone posting (not the job), then the job tells B.
update public.profiles set streak_current = 2 where id = pg_temp.uid('b');
select pg_temp.tag('f', 'b', '-1 hour');
select public.break_missed_streaks(pg_temp.uid('b'));
select is((select streak_current from public.profiles where id = pg_temp.uid('b')), 0,
  'the miss resets B when it is swept');
select public.mark_missed_tags();
select is((select count(*)::int from public.notifications
           where type = 'streak_lost' and user_id = pg_temp.uid('b')), 1,
  'and the job still tells B, who had points when it was missed');

select * from finish();
rollback;
