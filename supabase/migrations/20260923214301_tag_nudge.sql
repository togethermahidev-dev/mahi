-- Tag nudge: the tag picker shows when anyone last tagged each friend, never-tagged and
-- longest-ago first, so the app can flag friends nobody has tagged for nudge_days days.
alter table public.app_config
  add column nudge_days int not null default 7 constraint app_config_nudge_days_positive check (nudge_days > 0);

drop function public.get_taggable_friends(text, int);
create function public.get_taggable_friends(p_query text default '', p_limit int default 50)
returns table (
  id uuid, username text, display_name text, avatar_url text, has_open_tag boolean, points int,
  last_tagged_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, t.has_open_tag, public.points(p),
         (select max(c.created_at) from public.tag_challenges c where c.tagged_id = t.id)
  from public.taggable_friends(auth.uid()) t
  join public.profiles p on p.id = t.id
  where coalesce(p_query, '') = ''
     or strpos(lower(p.username), lower(p_query)) > 0
     or strpos(lower(coalesce(p.display_name, '')), lower(p_query)) > 0
  order by t.has_open_tag, 7 asc nulls first, p.username
  limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function public.get_taggable_friends(text, int) from public, anon, authenticated;
grant execute on function public.get_taggable_friends(text, int) to authenticated;
