-- toggle_like only acts for the signed-in user.
begin;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e00a', 'like-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000e00b', 'like-b@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-00000000e00a', 'like_a'),
  ('00000000-0000-0000-0000-00000000e00b', 'like_b');
insert into public.posts (id, user_id, image_url, streak_day)
values ('00000000-0000-0000-0000-0000000e0b01', '00000000-0000-0000-0000-00000000e00b', 'x', 1);
-- a can see b's post (likes only on posts you can see: 20261008100000_security_hardening).
update public.app_config set feed_lock_enabled = false;
insert into public.follows (follower_id, following_id)
values ('00000000-0000-0000-0000-00000000e00a', '00000000-0000-0000-0000-00000000e00b');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e00a","role":"authenticated"}';

select throws_ok(
  $$select * from public.toggle_like('00000000-0000-0000-0000-0000000e0b01', '00000000-0000-0000-0000-00000000e00b')$$,
  '42501', null, 'you cannot like on someone else''s behalf'
);
select is(
  (select liked from public.toggle_like('00000000-0000-0000-0000-0000000e0b01', '00000000-0000-0000-0000-00000000e00a')),
  true, 'you can like as yourself'
);
select is(
  (select liked from public.toggle_like('00000000-0000-0000-0000-0000000e0b01', '00000000-0000-0000-0000-00000000e00a')),
  false, 'and unlike'
);

reset role;
select is((select count(*)::int from public.post_likes where user_id = '00000000-0000-0000-0000-00000000e00b'), 0,
  'no like was made for the other user');

select * from finish();
rollback;
