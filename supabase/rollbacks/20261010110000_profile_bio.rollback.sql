-- Undo 20261010110000_profile_bio: set_bio, get_profile_about and the profile_bios table go
-- (every saved bio is deleted with the table: back it up first if they should be kept), and
-- get_follow_data is as 20261008170000_private_accounts again (counts returned across a block).
-- An app with the bio switch on then finds no get_profile_about and shows no bio.
begin;

drop function if exists public.set_bio(text);
drop function if exists public.get_profile_about(uuid);
drop table if exists public.profile_bios;

create or replace function public.get_follow_data(p_current_user_id uuid, p_target_user_id uuid)
returns table (
  is_following boolean,
  follower_count bigint,
  following_count bigint,
  follows_you boolean,
  requested boolean,
  is_private boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
  select
    v_uid <> p_target_user_id and exists (
      select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p_target_user_id),
    (select count(*) from public.follows f where f.following_id = p_target_user_id),
    (select count(*) from public.follows f where f.follower_id = p_target_user_id),
    v_uid <> p_target_user_id and exists (
      select 1 from public.follows f where f.follower_id = p_target_user_id and f.following_id = v_uid),
    exists (
      select 1 from public.follow_requests r
      where r.requester_id = v_uid and r.target_id = p_target_user_id),
    coalesce((select pr.is_private from public.profiles pr where pr.id = p_target_user_id), false);
end;
$$;

notify pgrst, 'reload schema';
delete from supabase_migrations.schema_migrations where version = '20261010110000';

commit;
