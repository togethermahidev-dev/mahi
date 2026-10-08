-- Security hardening from the live Supabase check (2026-10-08).
-- 1. Follows change only through set_following (and the definer functions that make Friends:
--    claim_invite, respond_tag_invite; handle_new_block removes them). The old direct insert and
--    delete rules go, and the app may no longer write the table. notify_on_follow skips a follow
--    across a block (either way) or from a banned person, as notify_on_tag does.
--    Phones on an app older than OTA 12.20 still follow by writing the table directly: their
--    Follow button stops working once this is live.
-- 2. profiles.avatar_url may only point at your own folder of the avatars bucket (the address
--    AvatarPicker gets from getPublicUrl('<your id>/avatar.jpg')). Every live row matched on
--    2026-10-08. A future preview project has its own address: change it there in a new migration.
-- 3. Avatar files: you can list only your own (the old rule let anyone list every file). The
--    bucket stays public, so the image addresses keep working without a rule; the app's upsert
--    needs to see its own file, which this rule allows.
-- 4. get_message_reactions / react_to_message: signed-in only (they refused signed-out callers
--    inside, but were callable by anon).
-- 5. anon has no table rights in public (everything signed-out goes through get_app_gate,
--    username_available and get_invite_preview, which run as their owner); authenticated loses
--    truncate, references and trigger. New tables get the same by default.
-- 6. Reports only through report_* (the app has used them since OTA 12.16): the old direct insert
--    rule and the insert column grant go. The reporter's own-report count (select column grant
--    from 20261008130000) stays.
-- 7. answered_by_post and post_invites (it returns a post's invite links) are internal: only the
--    posting functions, which run as their owner, call them.
-- Test: supabase/tests/security_hardening_live_test.sql
-- Undo: supabase/rollbacks/20261008140000_security_hardening_live.rollback.sql

-- 1. Follows.
drop policy if exists follows_insert on public.follows;
drop policy if exists follows_delete on public.follows;
revoke insert, update, delete, truncate on public.follows from anon, authenticated;

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.following_id <> new.follower_id
     and not exists (select 1 from public.profiles where id = new.follower_id and is_banned)
     and not exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = new.follower_id and b.blocked_id = new.following_id)
          or (b.blocker_id = new.following_id and b.blocked_id = new.follower_id)
     ) then
    insert into public.notifications (user_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_on_follow() from public, anon, authenticated;

-- 2. Avatar address: https, this project's avatars bucket, your own folder, no "..".
alter table public.profiles add constraint profiles_avatar_url_own_folder check (
  avatar_url is null
  or (avatar_url ~ ('^https://pzepodsppqtvptzmwxzs\.supabase\.co/storage/v1/object/public/avatars/'
                    || id::text || '/[A-Za-z0-9._/-]+(\?[A-Za-z0-9=&._-]*)?$')
      and avatar_url !~ '\.\.')
);

-- 3. Avatar files.
drop policy if exists "Public read access for avatars" on storage.objects;
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Message reactions.
revoke execute on function public.get_message_reactions(uuid), public.react_to_message(uuid, text)
  from public, anon;
grant execute on function public.get_message_reactions(uuid), public.react_to_message(uuid, text)
  to authenticated;

-- 5. Table rights.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- 6. Reports.
drop policy if exists "Users can insert own reports" on public.user_reports;
revoke insert on public.user_reports from anon, authenticated;

-- 7. Internal helpers.
revoke execute on function public.answered_by_post(uuid), public.post_invites(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
