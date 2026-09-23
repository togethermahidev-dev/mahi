-- Undo 20260923214301_tag_nudge. Restores get_taggable_friends as the points migration left it.
begin;
drop function public.get_taggable_friends(text, int);
create function public.get_taggable_friends(p_query text default '', p_limit int default 50)
returns table (
  id uuid, username text, display_name text, avatar_url text, has_open_tag boolean, points int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, t.has_open_tag, public.points(p)
  from public.taggable_friends(auth.uid()) t
  join public.profiles p on p.id = t.id
  where coalesce(p_query, '') = ''
     or strpos(lower(p.username), lower(p_query)) > 0
     or strpos(lower(coalesce(p.display_name, '')), lower(p_query)) > 0
  order by t.has_open_tag, p.username
  limit least(greatest(p_limit, 1), 100);
$$;
revoke execute on function public.get_taggable_friends(text, int) from public, anon, authenticated;
grant execute on function public.get_taggable_friends(text, int) to authenticated;
alter table public.app_config drop column nudge_days;
commit;
