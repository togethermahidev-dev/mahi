-- Undo 20261008140000_security_hardening_live: the app may write follows and reports directly
-- again, notify_on_follow goes back to its old body (as live on 2026-10-08), the avatar address
-- check goes, anyone may list avatar files again, and signed-out callers may call the two message
-- reaction functions again.
-- Left closed on purpose: anon's table rights in public, authenticated's truncate / references /
-- trigger, and answered_by_post / post_invites (internal since 20260917). Nothing in any app used
-- them, and giving "all" back would also reopen tables earlier migrations had closed.
begin;

-- 1. Follows.
grant insert, delete on public.follows to authenticated;
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete using (auth.uid() = follower_id);

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.following_id <> new.follower_id then
    insert into public.notifications (user_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;

-- 2. Avatar address.
alter table public.profiles drop constraint if exists profiles_avatar_url_own_folder;

-- 3. Avatar files.
drop policy if exists avatars_select_own on storage.objects;
drop policy if exists "Public read access for avatars" on storage.objects;
create policy "Public read access for avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- 4. Message reactions.
grant execute on function public.get_message_reactions(uuid), public.react_to_message(uuid, text)
  to public, anon;

-- 6. Reports (the columns 20261006100000_moderation granted).
grant insert (reporter_id, reported_user_id, reported_post_id, reason, description)
  on public.user_reports to authenticated;
drop policy if exists "Users can insert own reports" on public.user_reports;
create policy "Users can insert own reports"
  on public.user_reports for insert with check (auth.uid() = reporter_id);

delete from supabase_migrations.schema_migrations where version = '20261008140000';

notify pgrst, 'reload schema';

commit;
