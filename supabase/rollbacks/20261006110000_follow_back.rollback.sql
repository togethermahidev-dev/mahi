-- Undo 20261006110000_follow_back: get_follow_data loses follows_you (apps that read it then see
-- no "Follow back"; nothing else changes).
begin;

drop function public.get_follow_data(uuid, uuid);
create function public.get_follow_data(p_current_user_id uuid, p_target_user_id uuid)
returns table(is_following boolean, follower_count bigint, following_count bigint)
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
    (select count(*) from public.follows where follower_id = p_target_user_id) as following_count;
$$;
grant execute on function public.get_follow_data(uuid, uuid) to anon, authenticated, service_role;

delete from supabase_migrations.schema_migrations where version = '20261006110000';
notify pgrst, 'reload schema';

commit;
