-- Undo 20261008120000_comment_like_visibility: comments and likes readable by every signed-in
-- person again, and comment likes checked only for blocks (as live on 2026-10-07).
begin;

drop policy if exists comments_select on public.post_comments;
create policy comments_select on public.post_comments
  for select to authenticated
  using (removed_at is null or public.is_staff());

drop policy if exists likes_select on public.post_likes;
create policy likes_select on public.post_likes
  for select to authenticated
  using (true);

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
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = c.user_id)
           or (b.blocker_id = c.user_id and b.blocked_id = auth.uid())
      )
  );
$$;

delete from supabase_migrations.schema_migrations where version = '20261008120000';

notify pgrst, 'reload schema';

commit;
