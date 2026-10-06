drop function if exists public.update_post_caption(uuid, text);
create policy posts_update on public.posts for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy posts_delete on public.posts for delete to authenticated
  using (auth.uid() = user_id);
grant update, delete on public.posts to authenticated;
notify pgrst, 'reload schema';
