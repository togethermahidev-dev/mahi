-- Friends: the people someone follows who follow them back. One list, no numbers.
-- Hides banned users, anyone blocked either way with the profile owner, and anyone blocked
-- either way with the viewer. get_follow_data keeps returning counts for older app builds.
create function public.get_friends(p_user uuid, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, username text, display_name text, first_name text, last_name text, avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.first_name, p.last_name, p.avatar_url
  from public.follows f
  join public.follows back
    on back.follower_id = f.following_id and back.following_id = p_user
  join public.profiles p on p.id = f.following_id and not p.is_banned
  where f.follower_id = p_user
    and auth.uid() is not null
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_user and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = p_user)
         or (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by p.username
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.get_friends(uuid, int, int) from public, anon, authenticated;
grant execute on function public.get_friends(uuid, int, int) to authenticated;
