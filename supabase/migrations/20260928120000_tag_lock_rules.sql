-- Founder's lock and tag-back rules (2026-09-28).
-- 1. Every post opens your feed for 24 hours. After that it stays open until someone tags you;
--    once you've been tagged since your last post, it's locked until you post again.
--    Never posted: locked.
-- 2. You can't tag anyone whose tag your post is answering. The picker shows them as taken
--    (has_open_tag, with tagged_you saying why), create_post refuses them, and they don't count
--    as friends available to tag.
-- Tests: supabase/tests/feed_lock_test.sql, supabase/tests/invites_test.sql

create or replace function public.viewer_is_locked(p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select cfg.feed_lock_enabled and (
    last.at is null
    or (last.at + cfg.unlock_window <= now()
        and exists (
          select 1 from public.tag_challenges c
          where c.tagged_id = p_viewer and c.created_at > last.at
        ))
  )
  from public.app_config cfg
  cross join (select max(created_at) as at from public.posts where user_id = p_viewer) last;
$$;

-- has_open_tag now also means "they tagged you and your next post answers it".
create or replace function public.taggable_friends(p_user uuid)
returns table (id uuid, has_open_tag boolean)
language sql
stable
security definer
set search_path = public
as $$
  select f.following_id,
         exists (
           select 1 from public.tag_challenges c
           where c.tagger_id = p_user and c.tagged_id = f.following_id
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
         )
         or exists (
           select 1 from public.tag_challenges c
           cross join public.app_config cfg
           where c.tagger_id = f.following_id and c.tagged_id = p_user
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
             and now() <= c.expires_at + cfg.answer_grace
         )
  from public.follows f
  join public.follows back
    on back.follower_id = f.following_id and back.following_id = p_user
  join public.profiles pr on pr.id = f.following_id and not pr.is_banned
  where f.follower_id = p_user
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_user and b.blocked_id = f.following_id)
         or (b.blocker_id = f.following_id and b.blocked_id = p_user)
    );
$$;

-- The picker also says why: tagged_you = they tagged you and your post will answer it.
drop function public.get_taggable_friends(text, int);
create function public.get_taggable_friends(p_query text default '', p_limit int default 50)
returns table (
  id uuid, username text, display_name text, avatar_url text, has_open_tag boolean, points int,
  last_tagged_at timestamptz, tagged_you boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, t.has_open_tag, public.points(p),
         (select max(c.created_at) from public.tag_challenges c where c.tagged_id = t.id),
         exists (
           select 1 from public.tag_challenges c
           cross join public.app_config cfg
           where c.tagger_id = t.id and c.tagged_id = auth.uid()
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
             and now() <= c.expires_at + cfg.answer_grace
         )
  from public.taggable_friends(auth.uid()) t
  join public.profiles p on p.id = t.id
  where coalesce(p_query, '') = ''
     or strpos(lower(p.username), lower(p_query)) > 0
     or strpos(lower(coalesce(p.display_name, '')), lower(p_query)) > 0
  order by t.has_open_tag, 7 asc nulls first, p.username
  limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function public.get_taggable_friends(text, int) from public, anon, authenticated;
grant execute on function public.get_taggable_friends(text, int) to authenticated;

notify pgrst, 'reload schema';
