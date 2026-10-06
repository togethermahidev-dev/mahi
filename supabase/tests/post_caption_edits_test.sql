begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e001', 'caption-owner@example.invalid'),
  ('00000000-0000-0000-0000-00000000e002', 'caption-other@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-00000000e001', 'caption_owner'),
  ('00000000-0000-0000-0000-00000000e002', 'caption_other');
insert into public.posts (id, user_id, image_url, image_path, caption, streak_day, created_at) values
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000e001', 'x', 'caption/new.jpg', 'Before', 0, now()),
  ('00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-00000000e001', 'x', 'caption/old.jpg', 'Old', 0, now() - interval '1 hour');
-- The insert trigger stamps created_at with now(); backdate the old post with triggers off.
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-00000000e102';
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);

select lives_ok($$select public.update_post_caption('00000000-0000-0000-0000-00000000e101', '  After  ')$$,
  'the owner can edit during the first hour');
select is((select caption from public.posts where id = '00000000-0000-0000-0000-00000000e101'), 'After',
  'the server trims the caption');
reset role;
select is((select count(*)::int from public.moderation_scans where target_id = '00000000-0000-0000-0000-00000000e101'), 2,
  'the edited caption is queued for moderation as well as the original post');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select lives_ok($$select public.update_post_caption('00000000-0000-0000-0000-00000000e101', '   ')$$,
  'a blank caption removes the words');
select is((select caption from public.posts where id = '00000000-0000-0000-0000-00000000e101'), null,
  'blank is stored as no caption');
select throws_ok($$select public.update_post_caption('00000000-0000-0000-0000-00000000e102', 'Late')$$,
  '22023', 'caption editing has ended', 'editing ends at one hour');
select throws_ok($$select public.update_post_caption('00000000-0000-0000-0000-00000000e101', repeat('x', 201))$$,
  '22023', 'caption is too long', 'captions stay within 200 characters');
select throws_ok($$delete from public.posts where id = '00000000-0000-0000-0000-00000000e101'$$,
  '42501', null, 'an app user cannot delete a post');
select throws_ok($$update public.posts set caption = 'around the RPC' where id = '00000000-0000-0000-0000-00000000e101'$$,
  '42501', null, 'an app user cannot update a post directly');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);
select throws_ok($$select public.update_post_caption('00000000-0000-0000-0000-00000000e101', 'Mine')$$,
  '42501', 'not your post', 'another user cannot edit it');

select * from finish();
rollback;
