-- Comments and likes follow the post (security review, 2026-10-08). comments_select and
-- likes_select let every signed-in person read every comment and like, also on posts they may
-- not see; comment likes followed the comments. Now you read them only when you may see the post
-- (can_view_post_id: yours, or visible and allowed by the feed rule); your own comments you always
-- read. Staff still read every comment, removed ones too. Liking a comment (toggle_comment_like and the direct insert both use
-- comment_like_allowed) also needs the post to be visible to you and the comment not removed.
-- The app reads comments and likes for posts it already shows, so it sees no change.
-- Test: supabase/tests/comment_like_visibility_test.sql
-- Undo: supabase/rollbacks/20261008120000_comment_like_visibility.rollback.sql

drop policy if exists comments_select on public.post_comments;
create policy comments_select on public.post_comments
  for select to authenticated
  using (
    public.is_staff()
    or (removed_at is null and (user_id = auth.uid() or public.can_view_post_id(post_id)))
  );

drop policy if exists likes_select on public.post_likes;
create policy likes_select on public.post_likes
  for select to authenticated
  using (public.is_staff() or public.can_view_post_id(post_id));

-- comment_likes_select already reads through post_comments, so it follows comments_select.

create or replace function public.comment_like_allowed(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.post_comments c
    where c.id = p_comment_id
      and c.removed_at is null
      and public.can_view_post_id(c.post_id)
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = c.user_id)
           or (b.blocker_id = c.user_id and b.blocked_id = auth.uid())
      )
  );
$$;

notify pgrst, 'reload schema';
