-- NOT A MIGRATION YET (tag-loop plan, Phase 4, contract step).
-- Makes post photos private and applies the feed-lock rule to files, likes and comments.
--
-- When to use: after the app build that reads the feed through get_feed (signed photo URLs) is
-- live in both stores and app_config.min_app_version has been raised to it. Older builds show
-- broken images after this runs.
-- How: `supabase migration new private_bucket`, paste this in, write its rollback (recreate
-- posts_storage_select, likes_insert, comments_insert as they are live today; set the bucket
-- public again), test with scripts/db.sh local, back up, push.

-- Files: only people allowed to see the post (or its owner) can open or sign its photos.
drop policy if exists posts_storage_select on storage.objects;
create policy posts_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'posts' and public.can_view_post_object(name));

update storage.buckets set public = false where id = 'posts';

-- Likes and comments: only on posts you can see.
create function public.can_view_post_id(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id and public.can_view_post(auth.uid(), p.user_id)
  );
$$;
revoke execute on function public.can_view_post_id(uuid) from public, anon;
grant execute on function public.can_view_post_id(uuid) to authenticated;

drop policy if exists likes_insert on public.post_likes;
create policy likes_insert on public.post_likes
  for insert to authenticated
  with check (auth.uid() = user_id and public.can_view_post_id(post_id));

drop policy if exists comments_insert on public.post_comments;
create policy comments_insert on public.post_comments
  for insert to authenticated
  with check (auth.uid() = user_id and public.can_view_post_id(post_id));

-- toggle_like runs as its owner, so it checks the rule itself: re-create
-- 20260917105130_secure_toggle_like's function with this line after the caller check:
--   if not public.can_view_post_id(p_post_id) then
--     raise exception 'not allowed' using errcode = '42501';
--   end if;

-- The old feed read path goes.
revoke execute on function public.get_feed_posts(int, timestamptz, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
