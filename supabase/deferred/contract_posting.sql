-- NOT A MIGRATION YET (tag-loop plan, Phase 3, contract step).
-- Removes the old posting path so nothing can post around create_post's rules.
--
-- When to use: after the app build that posts through create_post is live in both stores and
-- app_config.min_app_version has been raised to that build's version.
-- How: `supabase migration new contract_posting`, paste this in, write its rollback (recreate the
-- two policies and the grant as they are live today), dry-run with scripts/db.sh try, back up, push.

-- Direct inserts into posts and post_tags (old app builds) stop working.
drop policy if exists posts_insert on public.posts;
revoke insert on public.posts from authenticated;

drop policy if exists post_tags_insert on public.post_tags;
revoke insert on public.post_tags from authenticated;

-- The client-dated streak call goes; create_post calls it internally as its owner.
revoke execute on function public.record_upload_streak(uuid, date) from public, anon, authenticated;

notify pgrst, 'reload schema';
