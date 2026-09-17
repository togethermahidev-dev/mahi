-- Undo 20260917114635_secure_toggle_like. Restores the unchecked version (re-opens the hole).
begin;

create or replace function public.toggle_like(p_post_id uuid, p_user_id uuid)
returns table (liked boolean, like_count bigint)
language plpgsql security definer as $$
declare
  _liked boolean;
  _rows  int;
begin
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
grant execute on function public.toggle_like(uuid, uuid) to public, anon;

delete from supabase_migrations.schema_migrations where version = '20260917114635';

commit;
