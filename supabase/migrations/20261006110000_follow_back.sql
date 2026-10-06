-- Follow back (owner, 2026-10-06): someone's profile can say "Follow back" when they follow you
-- and you don't follow them. get_follow_data (20260410224128) gains a fourth answer,
-- follows_you; the first three are unchanged, so apps already on phones keep working (they read
-- only the fields they know). Same rules as before: security invoker, follows readable by any
-- signed-in person.
-- Test: supabase/tests/follow_back_test.sql
-- Undo: supabase/rollbacks/20261006110000_follow_back.rollback.sql

drop function public.get_follow_data(uuid, uuid);
create function public.get_follow_data(p_current_user_id uuid, p_target_user_id uuid)
returns table(is_following boolean, follower_count bigint, following_count bigint, follows_you boolean)
language sql
stable
as $$
  select
    case
      when p_current_user_id = p_target_user_id then false
      else exists (
        select 1 from public.follows
        where follower_id = p_current_user_id and following_id = p_target_user_id
      )
    end as is_following,
    (select count(*) from public.follows where following_id = p_target_user_id) as follower_count,
    (select count(*) from public.follows where follower_id = p_target_user_id) as following_count,
    case
      when p_current_user_id = p_target_user_id then false
      else exists (
        select 1 from public.follows
        where follower_id = p_target_user_id and following_id = p_current_user_id
      )
    end as follows_you;
$$;

grant execute on function public.get_follow_data(uuid, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
