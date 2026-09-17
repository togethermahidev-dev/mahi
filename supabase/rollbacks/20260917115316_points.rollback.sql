-- Undo 20260917115316_points. All points are lost. Restores answer_tags_on_post,
-- get_taggable_friends and feed_item as the tag_challenges / feed_lock migrations left them.
begin;

create or replace function public.answer_tags_on_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  with answered as (
    update public.tag_challenges c
    set answered_post_id = new.id, answered_at = now()
    from public.app_config cfg
    where c.tagged_id = new.user_id
      and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
      and now() <= c.expires_at + cfg.answer_grace
    returning c.id
  )
  select array_agg(id) into v_ids from answered;
  if v_ids is null then
    return new;
  end if;
  delete from public.push_outbox where challenge_id = any(v_ids) and sent_at is null;
  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  select c.tagger_id, c.tagged_id, 'tag_answered', new.id, c.id
  from public.tag_challenges c where c.id = any(v_ids);
  return new;
end;
$$;

drop function public.get_taggable_friends(text, int);
create function public.get_taggable_friends(p_query text default '', p_limit int default 50)
returns table (id uuid, username text, display_name text, avatar_url text, has_open_tag boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, t.has_open_tag
  from public.taggable_friends(auth.uid()) t
  join public.profiles p on p.id = t.id
  where coalesce(p_query, '') = ''
     or strpos(lower(p.username), lower(p_query)) > 0
     or strpos(lower(coalesce(p.display_name, '')), lower(p_query)) > 0
  order by t.has_open_tag, p.username
  limit least(greatest(p_limit, 1), 100);
$$;
revoke execute on function public.get_taggable_friends(text, int) from public, anon;
grant execute on function public.get_taggable_friends(text, int) to authenticated;

-- feed_item as 20260917114517_feed_lock left it (no 'points').
create or replace function public.feed_item(p public.posts, p_viewer uuid, p_hide boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'created_at', p.created_at,
    'post_date', p.post_date,
    'streak_day', p.streak_day,
    'locked', p_hide,
    'image_path', case when p_hide then null else p.image_path end,
    'pov_image_path', case when p_hide then null else p.pov_image_path end,
    'caption', case when p_hide then null else p.caption end,
    'latitude', case when p_hide then null else p.latitude end,
    'longitude', case when p_hide then null else p.longitude end,
    'like_count', (select count(*) from public.post_likes l where l.post_id = p.id),
    'comment_count', (select count(*) from public.post_comments c where c.post_id = p.id),
    'liked_by_me', exists (
      select 1 from public.post_likes l where l.post_id = p.id and l.user_id = p_viewer
    ),
    'tagged_users', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', tp.id, 'username', tp.username,
               'display_name', tp.display_name, 'avatar_url', tp.avatar_url
             ) order by tp.username)
      from public.post_tags pt
      join public.profiles tp on tp.id = pt.user_id
      where pt.post_id = p.id
    ), '[]'::jsonb),
    'response', (
      select jsonb_build_object(
               'tagger_username', t.username,
               'seconds', extract(epoch from c.answered_at - c.created_at)::int)
      from public.tag_challenges c
      join public.profiles t on t.id = c.tagger_id
      where c.answered_post_id = p.id
      order by c.created_at
      limit 1
    ),
    'profile', (
      select jsonb_build_object(
               'id', pr.id, 'username', pr.username,
               'display_name', pr.display_name, 'avatar_url', pr.avatar_url)
      from public.profiles pr
      where pr.id = p.user_id
    )
  );
$$;

drop function public.points(public.profiles);
drop function public.award_point(uuid, uuid, text);
drop table public.point_events;
alter table public.app_config drop column daily_point_cap;

delete from supabase_migrations.schema_migrations where version = '20260917115316';

commit;
