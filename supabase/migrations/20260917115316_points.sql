-- Mahi points (tag-loop plan, Phase 5; decisions #6, #7). The streak rule (#1, #10) is parked.
-- One row per point. The daily cap is a unique slot per user per local day, and the total is
-- counted on read, so no transaction updates a shared counter: nothing to race or deadlock on.
-- Test: supabase/tests/points_test.sql

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

-- One point, if the user is under today's cap and hasn't been paid for this challenge.
-- Slots are tried in order; a concurrent award for the same user waits on the same slot's
-- unique entry and then moves to the next one.
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

-- A profile's total. PostgREST exposes it as a computed column: select('…, points').
create function public.points(p public.profiles)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.point_events where user_id = p.id;
$$;

-- Answering now also pays both people. Awards run in user-id order so two posts paying the
-- same people always take their locks in the same order.
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

-- The tag list shows points.
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

-- Feed items show the poster's points.
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
               'display_name', pr.display_name, 'avatar_url', pr.avatar_url,
               'points', public.points(pr))
      from public.profiles pr
      where pr.id = p.user_id
    )
  );
$$;

revoke execute on function
  public.award_point(uuid, uuid, text),
  public.get_taggable_friends(text, int)
from public, anon, authenticated;

grant execute on function public.get_taggable_friends(text, int) to authenticated;
revoke execute on function public.points(public.profiles) from public, anon;
grant execute on function public.points(public.profiles) to authenticated;

notify pgrst, 'reload schema';
