-- Feed lock (tag-loop plan, Phase 4, expand step; decisions #3, #4, #9).
-- New read path for the app: get_feed / get_user_posts return people you follow, and hide photos
-- and captions unless you posted in the last 24 hours. Older app builds keep using
-- get_feed_posts and the public bucket until the contract step
-- (supabase/deferred/private_bucket.sql) makes the bucket private and gates likes/comments.
-- Test: supabase/tests/feed_lock_test.sql

alter table public.app_config
  add column unlock_window interval not null default '24 hours',
  add column feed_lock_enabled boolean not null default true;

-- Storage paths for posts made before create_post existed.
update public.posts
set image_path = substring(image_url from '/object/public/posts/(.+)$')
where image_path is null;
update public.posts
set pov_image_path = substring(pov_image_url from '/object/public/posts/(.+)$')
where pov_image_path is null and pov_image_url is not null;

create index posts_image_path_idx on public.posts (image_path);
create index posts_pov_image_path_idx on public.posts (pov_image_path) where pov_image_path is not null;

-- When a viewer's unlock ends (null = never posted).
create function public.viewer_unlocked_until(p_viewer uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(p.created_at) + (select unlock_window from public.app_config)
  from public.posts p
  where p.user_id = p_viewer;
$$;

-- Whether the viewer is currently locked out of friends' posts.
create function public.viewer_is_locked(p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select cfg.feed_lock_enabled
         and coalesce(public.viewer_unlocked_until(p_viewer) <= now(), true)
  from public.app_config cfg;
$$;

-- The one visibility rule: yours, or a followed, unbanned, unblocked person while unlocked.
create function public.can_view_post(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer = p_owner or (
    exists (select 1 from public.profiles where id = p_owner and not is_banned)
    and exists (
      select 1 from public.follows where follower_id = p_viewer and following_id = p_owner
    )
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_viewer and b.blocked_id = p_owner)
         or (b.blocker_id = p_owner and b.blocked_id = p_viewer)
    )
    and not public.viewer_is_locked(p_viewer)
  );
$$;

-- For the storage read policy (applied in the contract step): may the caller open this file?
create function public.can_view_post_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(p_name, '/', 1) = auth.uid()::text
      or exists (
        select 1 from public.posts p
        where (p.image_path = p_name or p.pov_image_path = p_name)
          and public.can_view_post(auth.uid(), p.user_id)
      );
$$;

-- One post as the app sees it. `p_hide` blanks the photo paths, caption and location.
create function public.feed_item(p public.posts, p_viewer uuid, p_hide boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'created_at', p.created_at,
    'post_date', p.post_date,
    'streak_day', p.streak_day,
    'locked', p_hide,
    'image_path', case when p_hide then null else p.image_path end,
    'pov_image_path', case when p_hide then null else p.pov_image_path end,
    'caption', case when p_hide then null else p.caption end,
    'latitude', case when p_hide then null else p.latitude end,
    'longitude', case when p_hide then null else p.longitude end,
    'like_count', (select count(*) from public.post_likes l where l.post_id = p.id),
    'comment_count', (select count(*) from public.post_comments c where c.post_id = p.id),
    'liked_by_me', exists (
      select 1 from public.post_likes l where l.post_id = p.id and l.user_id = p_viewer
    ),
    'tagged_users', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', tp.id, 'username', tp.username,
               'display_name', tp.display_name, 'avatar_url', tp.avatar_url
             ) order by tp.username)
      from public.post_tags pt
      join public.profiles tp on tp.id = pt.user_id
      where pt.post_id = p.id
    ), '[]'::jsonb),
    'response', (
      select jsonb_build_object(
               'tagger_username', t.username,
               'seconds', extract(epoch from c.answered_at - c.created_at)::int)
      from public.tag_challenges c
      join public.profiles t on t.id = c.tagger_id
      where c.answered_post_id = p.id
      order by c.created_at
      limit 1
    ),
    'profile', (
      select jsonb_build_object(
               'id', pr.id, 'username', pr.username,
               'display_name', pr.display_name, 'avatar_url', pr.avatar_url)
      from public.profiles pr
      where pr.id = p.user_id
    )
  );
$$;

-- The feed: your posts and those of people you follow, newest first, 1–50 per page.
create function public.get_feed(
  p_limit int default 20,
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_locked boolean;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_locked := public.viewer_is_locked(v_uid);

  select coalesce(
           jsonb_agg(public.feed_item(s.p, v_uid, v_locked and (s.p).user_id <> v_uid)
                     order by (s.p).created_at desc, (s.p).id desc),
           '[]'::jsonb)
  into v_items
  from (
    select p
    from public.posts p
    join public.profiles pr on pr.id = p.user_id and not pr.is_banned
    where (
        p.user_id = v_uid
        or exists (
          select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p.user_id
        )
      )
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_uid)
      )
      and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) s;

  return jsonb_build_object(
    'locked', v_locked,
    'unlocked_until', public.viewer_unlocked_until(v_uid),
    'server_now', now(),
    'items', v_items
  );
end;
$$;

-- One person's posts for their profile, under the same rule (your own are never hidden).
create function public.get_user_posts(
  p_user uuid,
  p_limit int default 30,
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hide boolean;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_uid <> p_user and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_user)
       or (b.blocker_id = p_user and b.blocked_id = v_uid)
  ) then
    return jsonb_build_object('locked', true, 'items', '[]'::jsonb);
  end if;
  v_hide := not public.can_view_post(v_uid, p_user);

  select coalesce(
           jsonb_agg(public.feed_item(s.p, v_uid, v_hide)
                     order by (s.p).created_at desc, (s.p).id desc),
           '[]'::jsonb)
  into v_items
  from (
    select p
    from public.posts p
    where p.user_id = p_user
      and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) s;

  return jsonb_build_object('locked', v_hide, 'items', v_items);
end;
$$;

revoke execute on function
  public.viewer_unlocked_until(uuid),
  public.viewer_is_locked(uuid),
  public.can_view_post(uuid, uuid),
  public.can_view_post_object(text),
  public.feed_item(public.posts, uuid, boolean),
  public.get_feed(int, timestamptz, uuid),
  public.get_user_posts(uuid, int, timestamptz, uuid)
from public, anon, authenticated;

grant execute on function
  public.can_view_post_object(text),
  public.get_feed(int, timestamptz, uuid),
  public.get_user_posts(uuid, int, timestamptz, uuid)
to authenticated;

notify pgrst, 'reload schema';
