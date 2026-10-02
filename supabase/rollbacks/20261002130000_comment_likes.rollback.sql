-- Undo 20261002130000_comment_likes: drops comment likes (every like on every comment is lost)
-- and their functions. Comments themselves are untouched. Switch the `comment-likes` flag off
-- first: with it on, the app would call functions that no longer exist (the hearts then stay at
-- 0 and a tap says it couldn't update the like; comments still load).
begin;

drop function public.get_comment_likers(uuid);
drop function public.get_comment_likes(uuid);
drop function public.toggle_comment_like(uuid);
drop table public.comment_likes;
drop function public.comment_like_allowed(uuid);

delete from supabase_migrations.schema_migrations where version = '20261002130000';

commit;
