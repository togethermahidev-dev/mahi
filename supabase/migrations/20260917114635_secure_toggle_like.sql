-- Security fix: toggle_like ran as its owner without checking the caller, so any signed-in user
-- could like or unlike posts as anyone else. Same behaviour, plus the caller check and a pinned
-- search_path. Current app builds pass their own id, so nothing breaks.
-- Test: supabase/tests/secure_toggle_like_test.sql

create or replace function public.toggle_like(p_post_id uuid, p_user_id uuid)
returns table (liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  _liked boolean;
  _rows int;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.post_likes (post_id, user_id) values (p_post_id, p_user_id)
  on conflict (post_id, user_id) do nothing;
  get diagnostics _rows = row_count;
  if _rows > 0 then
    _liked := true;
  else
    delete from public.post_likes where post_id = p_post_id and user_id = p_user_id;
    _liked := false;
  end if;
  return query select _liked, count(*) from public.post_likes where post_id = p_post_id;
end;
$$;

revoke execute on function public.toggle_like(uuid, uuid) from public, anon;
grant execute on function public.toggle_like(uuid, uuid) to authenticated;
