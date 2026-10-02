-- Undo 20261002170000_mahi_points: puts back the old points (tagger point, 3-a-day cap,
-- never-resetting total counted from point_events), the old award on answering, `points` as that
-- total in the profile, feed and tag list, the stats view, and the "streak" push text.
-- The ledger comes back empty. It was empty on prod when the migration was written (checked
-- 2026-10-02); any rows earned before the push are in the backup taken just before it
-- (supabase/backups/<timestamp>_data.sql, table public.point_events). Mahi points
-- (streak_current / streak_highest) are untouched either way.
-- The app from this release shows streak_current as points, so it keeps working after this.
begin;

-- The daily cap and the ledger (as 20260917115316_points made them).
alter table public.app_config
  add column daily_point_cap int not null default 3 check (daily_point_cap between 1 and 10);

create table public.point_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid references public.tag_challenges(id) on delete set null,
  role text not null check (role in ('answerer', 'tagger')),
  local_date date not null,
  slot int not null check (slot between 1 and 10),
  created_at timestamptz not null default now(),
  unique (user_id, local_date, slot),
  unique (challenge_id, user_id)
);
create index point_events_user on public.point_events (user_id);

alter table public.point_events enable row level security;
revoke insert, update, delete on public.point_events from anon, authenticated;
create policy point_events_select_own on public.point_events
  for select to authenticated
  using (auth.uid() = user_id);

create function public.award_point(p_user uuid, p_challenge uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_cap int;
begin
  select (now() at time zone timezone)::date into v_date
  from public.profiles where id = p_user and not is_banned;
  if not found then
    return;
  end if;
  select daily_point_cap into v_cap from public.app_config;

  for s in 1..v_cap loop
    insert into public.point_events (user_id, challenge_id, role, local_date, slot)
    values (p_user, p_challenge, p_role, v_date, s)
    on conflict do nothing;
    if found then
      return;
    end if;
    if p_challenge is not null and exists (
      select 1 from public.point_events where challenge_id = p_challenge and user_id = p_user
    ) then
      return;
    end if;
  end loop;
end;
$$;

create or replace function public.points(p public.profiles)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.point_events where user_id = p.id;
$$;

-- Answering pays both people again (as 20260917115316_points left it).
create or replace function public.answer_tags_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  r record;
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

  for r in
    select c.tagged_id as user_id, c.id, 'answerer' as role
    from public.tag_challenges c where c.id = any(v_ids)
    union all
    select c.tagger_id, c.id, 'tagger'
    from public.tag_challenges c where c.id = any(v_ids)
    order by 1, 2
  loop
    perform public.award_point(r.user_id, r.id, r.role);
  end loop;
  return new;
end;
$$;

-- Feed items with the old total (as 20261002100000_video_posts left it).
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
    'rear_media_type', case when p_hide then null else p.rear_media_type end,
    'front_media_type', case when p_hide then null else p.front_media_type end,
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
               'display_name', pr.display_name, 'avatar_url', pr.avatar_url,
               'points', public.points(pr))
      from public.profiles pr
      where pr.id = p.user_id
    )
  );
$$;

-- The tag list with the old total (as 20260928120000_tag_lock_rules left it).
create or replace function public.get_taggable_friends(p_query text default '', p_limit int default 50)
returns table (
  id uuid, username text, display_name text, avatar_url text, has_open_tag boolean, points int,
  last_tagged_at timestamptz, tagged_you boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, t.has_open_tag, public.points(p),
         (select max(c.created_at) from public.tag_challenges c where c.tagged_id = t.id),
         exists (
           select 1 from public.tag_challenges c
           cross join public.app_config cfg
           where c.tagger_id = t.id and c.tagged_id = auth.uid()
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
             and now() <= c.expires_at + cfg.answer_grace
         )
  from public.taggable_friends(auth.uid()) t
  join public.profiles p on p.id = t.id
  where coalesce(p_query, '') = ''
     or strpos(lower(p.username), lower(p_query)) > 0
     or strpos(lower(coalesce(p.display_name, '')), lower(p_query)) > 0
  order by t.has_open_tag, 7 asc nulls first, p.username
  limit least(greatest(p_limit, 1), 100);
$$;

-- The missed-tag push says "streak" again (as 20261001120000_reactive_posting left it).
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_c public.tag_challenges;
  v_hours int;
begin
  select '@' || username into v_actor from public.profiles where id = new.actor_id;

  if new.challenge_id is not null then
    select * into v_c from public.tag_challenges where id = new.challenge_id;
  elsif new.type = 'tag' then
    select * into v_c from public.tag_challenges
    where post_id = new.post_id and tagged_id = new.user_id;
  end if;
  select floor(extract(epoch from tag_window) / 3600)::int into v_hours from public.app_config;

  perform public.enqueue_push(
    new.user_id,
    new.actor_id,
    new.type,
    case new.type
      when 'like' then v_actor || ' liked your post'
      when 'comment' then v_actor || ' commented on your post'
      when 'follow' then v_actor || ' started following you'
      when 'tag' then
        case when v_c.id is null then v_actor || ' tagged you in a post'
             else v_actor || ' tagged you. You have ' || v_hours || ' hours to post.' end
      when 'tag_answered' then
        v_actor || ' posted ' || public.format_wait(v_c.answered_at - v_c.created_at) || ' after your tag'
      when 'tag_missed' then v_actor || ' missed your tag'
      when 'invite_joined' then v_actor || ' joined Mahi from your invite'
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your streak is back to 0.'
      else v_actor
    end,
    jsonb_build_object(
      'route', case
        when new.type = 'follow' then 'profile'
        when new.type = 'tag' and v_c.id is not null then 'camera'
        when new.type = 'invite_joined' then 'profile'
        else 'post'
      end,
      'post_id', new.post_id,
      'user_id', new.actor_id,
      'notification_id', new.id
    ),
    now(),
    'notification:' || new.id,
    v_c.id
  );
  return new;
end;
$$;

-- The stats view (as 20260923101500_stats_views made it).
create view stats.points_daily as
select
  e.local_date as day,
  count(*)::int as points,
  count(distinct e.user_id)::int as earners,
  count(*) filter (where e.role = 'answerer')::int as to_answerers,
  count(*) filter (where e.role = 'tagger')::int as to_taggers
from public.point_events e
group by 1;
revoke all on all tables in schema stats from anon, authenticated;

revoke execute on function public.award_point(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.points(public.profiles) from public, anon;
grant execute on function public.points(public.profiles) to authenticated;

delete from supabase_migrations.schema_migrations where version = '20261002170000';

notify pgrst, 'reload schema';

commit;
