-- Video posts: each shot of a post is a photo or a video (default photo). create_post takes the
-- media types (older builds send none → photos), refuses anything else, and the feed returns them
-- only to viewers who may see the post. The posts bucket takes short videos.
begin;
select plan(28);

update public.app_config set tags_required = false, quiet_start = '00:00', quiet_end = '00:00';

-- A posts a video; B follows A and has posted (open feed); C follows A and never posted (locked);
-- D posts the way older builds do; E tries the wrong things.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000071aa', 'video-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000071bb', 'video-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000071cc', 'video-c@example.invalid'),
  ('00000000-0000-0000-0000-0000000071dd', 'video-d@example.invalid'),
  ('00000000-0000-0000-0000-0000000071ee', 'video-e@example.invalid');
insert into public.profiles (id, username, timezone) values
  ('00000000-0000-0000-0000-0000000071aa', 'video_a', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000071bb', 'video_b', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000071cc', 'video_c', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000071dd', 'video_d', 'Europe/London'),
  ('00000000-0000-0000-0000-0000000071ee', 'video_e', 'Europe/London');
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-0000000071bb', '00000000-0000-0000-0000-0000000071aa'),
  ('00000000-0000-0000-0000-0000000071cc', '00000000-0000-0000-0000-0000000071aa');
insert into storage.objects (bucket_id, name) values
  ('posts', '00000000-0000-0000-0000-0000000071aa/v1_rear.mov'),
  ('posts', '00000000-0000-0000-0000-0000000071aa/v1_pov.jpg'),
  ('posts', '00000000-0000-0000-0000-0000000071bb/b1_rear.jpg'),
  ('posts', '00000000-0000-0000-0000-0000000071dd/d1_rear.jpg'),
  ('posts', '00000000-0000-0000-0000-0000000071dd/d1_pov.jpg'),
  ('posts', '00000000-0000-0000-0000-0000000071ee/e1_rear.jpg'),
  ('posts', '00000000-0000-0000-0000-0000000071ee/e1_rear.mp4');

create function pg_temp.as_user(p_who text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000071' || p_who || p_who || '","role":"authenticated"}', true);
end;
$$;

-- 1. The columns: a media type per shot, photo by default, nothing but photo or video.
select col_default_is('public', 'posts', 'rear_media_type', 'photo',
  'the rear shot is a photo unless said otherwise');
select col_default_is('public', 'posts', 'front_media_type', 'photo',
  'the selfie is a photo unless said otherwise');
select col_not_null('public', 'posts', 'rear_media_type', 'rear media type is never empty');
select col_not_null('public', 'posts', 'front_media_type', 'front media type is never empty');
select throws_ok($$
  insert into public.posts (user_id, image_url, streak_day, rear_media_type)
  values ('00000000-0000-0000-0000-0000000071ee', 'x', 0, 'gif')
$$, '23514', null, 'a media type other than photo or video is refused');

-- 2. Only one create_post, so older builds' calls can't be ambiguous.
select is((select count(*)::int from pg_proc
           where proname = 'create_post' and pronamespace = 'public'::regnamespace), 1,
  'there is exactly one create_post');
select ok(has_function_privilege('authenticated',
  'public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int, text, text)',
  'execute'), 'signed-in people can call create_post');
select ok(not has_function_privilege('anon',
  'public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int, text, text)',
  'execute'), 'signed-out callers cannot');

-- 3. An older build's call (no media types) still posts, as photos.
select pg_temp.as_user('d');
select is((public.create_post('77777777-0000-0000-0000-0000000000d1'::uuid,
  '00000000-0000-0000-0000-0000000071dd/d1_rear.jpg', '00000000-0000-0000-0000-0000000071dd/d1_pov.jpg',
  null, '{}'::uuid[], null, null, 0) -> 'post' ->> 'rear_media_type'), 'photo',
  'a call with no media types makes a photo post');
reset role;
select is((select front_media_type from public.posts where client_id = '77777777-0000-0000-0000-0000000000d1'),
  'photo', 'both shots are photos');

-- 4. A video post: rear video, front photo.
select pg_temp.as_user('a');
select is((public.create_post(
  p_client_id => '77777777-0000-0000-0000-0000000000a1'::uuid,
  p_image_path => '00000000-0000-0000-0000-0000000071aa/v1_rear.mov',
  p_pov_image_path => '00000000-0000-0000-0000-0000000071aa/v1_pov.jpg',
  p_rear_media_type => 'video',
  p_front_media_type => 'photo') -> 'post' ->> 'rear_media_type'), 'video',
  'a post can carry a video');
reset role;
select is((select array[rear_media_type, front_media_type] from public.posts
           where client_id = '77777777-0000-0000-0000-0000000000a1'), array['video', 'photo'],
  'each shot keeps its own media type');
select is((select streak_day from public.posts where client_id = '77777777-0000-0000-0000-0000000000a1'), 0,
  'a video post follows the same posting rules (a first post, streak 0)');

-- 5. Wrong media is refused.
select pg_temp.as_user('e');
select throws_ok($$select public.create_post(
  p_client_id => '77777777-0000-0000-0000-0000000000e1'::uuid,
  p_image_path => '00000000-0000-0000-0000-0000000071ee/e1_rear.jpg',
  p_rear_media_type => 'gif')$$, '22023', 'unsupported media',
  'an unknown media type is refused');
select throws_ok($$select public.create_post(
  p_client_id => '77777777-0000-0000-0000-0000000000e2'::uuid,
  p_image_path => '00000000-0000-0000-0000-0000000071ee/e1_rear.jpg',
  p_rear_media_type => 'video')$$, '22023', 'unsupported media',
  'a video must be a video file (.mov or .mp4)');
select throws_ok($$select public.create_post(
  p_client_id => '77777777-0000-0000-0000-0000000000e3'::uuid,
  p_image_path => '00000000-0000-0000-0000-0000000071ee/e1_rear.mp4',
  p_rear_media_type => 'photo')$$, '22023', 'unsupported media',
  'a photo must not be a video file');
select throws_ok($$select public.create_post(
  p_client_id => '77777777-0000-0000-0000-0000000000e4'::uuid,
  p_image_path => '00000000-0000-0000-0000-0000000071ee/e1_rear.jpg',
  p_front_media_type => 'video')$$, '22023', 'unsupported media',
  'a front video needs a front file');
select lives_ok($$select public.create_post(
  p_client_id => '77777777-0000-0000-0000-0000000000e5'::uuid,
  p_image_path => '00000000-0000-0000-0000-0000000071ee/e1_rear.mp4',
  p_rear_media_type => 'video')$$, 'an mp4 (Android) video is fine');
reset role;

-- 6. B has posted: B's feed is open and shows A's video with its media types.
select pg_temp.as_user('b');
select lives_ok($$select public.create_post('77777777-0000-0000-0000-0000000000b1'::uuid,
  '00000000-0000-0000-0000-0000000071bb/b1_rear.jpg')$$, 'B posts (a first post)');
create temp table b_feed on commit drop as
  select i from jsonb_array_elements(public.get_feed(20) -> 'items') i
  where i ->> 'user_id' = '00000000-0000-0000-0000-0000000071aa';
select is((select i ->> 'rear_media_type' from b_feed), 'video', 'an open feed says the rear shot is a video');
select is((select i ->> 'front_media_type' from b_feed), 'photo', 'and the selfie is a photo');
select is((select i ->> 'image_path' from b_feed), '00000000-0000-0000-0000-0000000071aa/v1_rear.mov',
  'and gives the video''s path to sign');
select is((public.get_user_posts('00000000-0000-0000-0000-0000000071aa') -> 'items' -> 0 ->> 'rear_media_type'),
  'video', 'a profile''s posts carry media types too');
reset role;

-- 7. C never posted: C's feed is locked and learns nothing about the video.
select pg_temp.as_user('c');
create temp table c_feed on commit drop as
  select i from jsonb_array_elements(public.get_feed(20) -> 'items') i
  where i ->> 'user_id' = '00000000-0000-0000-0000-0000000071aa';
select is((select (i ->> 'locked')::boolean from c_feed), true, 'a locked viewer gets a locked item');
select is((select i ->> 'image_path' from c_feed), null, 'with no video path to sign');
select is((select i ->> 'rear_media_type' from c_feed), null, 'and no media type');
reset role;

-- 8. The posts bucket takes photos and short videos, up to 50 MB a file.
select is((select file_size_limit from storage.buckets where id = 'posts'), 52428800::bigint,
  'the posts bucket allows files up to 50 MB');
select is((select allowed_mime_types from storage.buckets where id = 'posts'),
  array['image/jpeg', 'video/quicktime', 'video/mp4'],
  'the posts bucket takes JPEG photos and QuickTime / mp4 videos only');

select * from finish();
rollback;
