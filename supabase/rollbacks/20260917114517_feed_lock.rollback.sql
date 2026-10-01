-- Undo 20260917114517_feed_lock. The backfilled image paths are kept (harmless).
begin;

drop function if exists public.get_user_posts(uuid, int, timestamptz, uuid);
drop function if exists public.get_feed(int, timestamptz, uuid);
drop function if exists public.feed_item(public.posts, uuid, boolean);
drop function if exists public.can_view_post_object(text);
drop function if exists public.can_view_post(uuid, uuid);
drop function if exists public.viewer_is_locked(uuid);
drop function if exists public.viewer_unlocked_until(uuid);

drop index if exists public.posts_pov_image_path_idx;
drop index if exists public.posts_image_path_idx;

alter table public.app_config
  drop column feed_lock_enabled,
  drop column unlock_window;

delete from supabase_migrations.schema_migrations where version = '20260917114517';

commit;
