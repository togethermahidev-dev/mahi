-- One authoritative follow mutation (owner, 2026-10-07).
--
-- Older apps write public.follows directly. New apps use this function so a tap is atomic,
-- idempotent and answered with the committed server state. A follow is still one-way; two people
-- are friends only when both rows exist. Invite acceptance already creates both rows.
create function public.set_following(p_target_user_id uuid, p_following boolean)
returns table (
  is_following boolean,
  follower_count bigint,
  following_count bigint,
  follows_you boolean,
  current_following_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'cannot follow that person' using errcode = '22023';
  end if;

  if p_following then
    if not exists (
      select 1 from public.profiles p
      where p.id = p_target_user_id and not p.is_banned
    ) or exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p_target_user_id)
         or (b.blocker_id = p_target_user_id and b.blocked_id = v_uid)
    ) then
      raise exception 'cannot follow that person' using errcode = '22023';
    end if;

    insert into public.follows (follower_id, following_id)
    values (v_uid, p_target_user_id)
    on conflict (follower_id, following_id) do nothing;
  else
    delete from public.follows
    where follower_id = v_uid and following_id = p_target_user_id;
  end if;

  return query
  select d.is_following, d.follower_count, d.following_count, d.follows_you,
         (select count(*) from public.follows f where f.follower_id = v_uid)
  from public.get_follow_data(v_uid, p_target_user_id) d;
end;
$$;

revoke execute on function public.set_following(uuid, boolean) from public, anon;
grant execute on function public.set_following(uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
