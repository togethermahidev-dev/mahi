-- Tag challenges (tag-loop plan, Phase 2; decisions #2, #5, #8 in docs/decisions.md).
-- Posting becomes one server call, create_post(), that records the post, the streak, 3 tags,
-- their 48-hour deadlines and their pushes in one transaction. Any new post (from this call or
-- from an older app build) answers the poster's open tags, via a trigger.
-- Test: supabase/tests/tag_challenges_test.sql

-- 1. Settings.
alter table public.app_config
  add column tag_count int not null default 3 check (tag_count between 0 and 10),
  add column tags_required boolean not null default true,
  add column tag_window interval not null default '48 hours',
  add column answer_grace interval not null default '10 minutes',
  add column storage_public_url text not null
    default 'https://pzepodsppqtvptzmwxzs.supabase.co/storage/v1/object/public';

-- 2. Posts: idempotency key and storage paths.
alter table public.posts
  add column client_id uuid unique,
  add column image_path text,
  add column pov_image_path text;

-- 3. Challenges. State comes from the timestamps:
--    open = none of answered_at / cancelled_at / missed_at set (and not past expires_at + grace).
create table public.tag_challenges (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete set null,
  tagger_id uuid not null references public.profiles(id) on delete cascade,
  tagged_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  answered_post_id uuid references public.posts(id) on delete set null,
  answered_at timestamptz,
  cancelled_at timestamptz,
  missed_at timestamptz,
  missed_notified_at timestamptz,
  constraint tag_challenges_not_self check (tagger_id <> tagged_id)
);

-- One open tag per tagger → friend pair. A lost race fails here.
create unique index tag_challenges_one_open_pair on public.tag_challenges (tagger_id, tagged_id)
  where answered_at is null and cancelled_at is null and missed_at is null;
create index tag_challenges_open_tagged on public.tag_challenges (tagged_id)
  where answered_at is null and cancelled_at is null and missed_at is null;
create index tag_challenges_unnotified_miss on public.tag_challenges (expires_at)
  where answered_at is null and cancelled_at is null and missed_notified_at is null;
create index tag_challenges_answered_post on public.tag_challenges (answered_post_id)
  where answered_post_id is not null;

alter table public.tag_challenges enable row level security;
revoke insert, update, delete on public.tag_challenges from anon, authenticated;
create policy tag_challenges_select_own on public.tag_challenges
  for select to authenticated
  using (auth.uid() in (tagger_id, tagged_id));

-- 4. Pushes and notifications can belong to a challenge; they go when it goes.
alter table public.push_outbox
  add column challenge_id uuid references public.tag_challenges(id) on delete cascade;
create index push_outbox_challenge on public.push_outbox (challenge_id) where challenge_id is not null;

alter table public.notifications
  add column challenge_id uuid references public.tag_challenges(id) on delete cascade;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag', 'tag_answered', 'tag_missed'));

-- 5. enqueue_push gains a challenge link and a "don't send after" limit (a reminder pushed past
--    the deadline by quiet hours is dropped).
drop function public.enqueue_push(uuid, uuid, text, text, jsonb, timestamptz, text);
create function public.enqueue_push(
  p_user uuid,
  p_actor uuid,
  p_kind text,
  p_body text,
  p_data jsonb,
  p_send_after timestamptz default now(),
  p_dedupe_key text default null,
  p_challenge_id uuid default null,
  p_not_after timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_at timestamptz;
begin
  if p_actor is not null and (
    p_actor = p_user
    or exists (
      select 1 from public.user_blocks
      where (blocker_id = p_user and blocked_id = p_actor)
         or (blocker_id = p_actor and blocked_id = p_user)
    )
    or exists (select 1 from public.profiles where id = p_actor and is_banned)
  ) then
    return;
  end if;

  select timezone into v_tz from public.profiles where id = p_user and not is_banned;
  if not found then
    return;
  end if;

  v_at := public.push_send_time(p_send_after, v_tz);
  if p_not_after is not null and v_at > p_not_after then
    return;
  end if;

  insert into public.push_outbox (user_id, kind, body, data, send_after, dedupe_key, challenge_id)
  values (p_user, p_kind, p_body, coalesce(p_data, '{}'), v_at, p_dedupe_key, p_challenge_id)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- "3h", "45m", "1d 2h"
create function public.format_wait(p interval)
returns text
language sql
immutable
as $$
  select case
    when p < interval '1 hour' then greatest(floor(extract(epoch from p) / 60), 1)::int || 'm'
    when p < interval '1 day' then floor(extract(epoch from p) / 3600)::int || 'h'
    else floor(extract(epoch from p) / 86400)::int || 'd '
         || (floor(extract(epoch from p) / 3600)::int % 24) || 'h'
  end;
$$;

-- 6. Push text for every notification type, including the new ones.
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
      when 'tag_missed' then
        case when new.user_id = v_c.tagger_id then v_actor || ' missed your tag'
             else 'You missed ' || v_actor || '''s tag' end
      else v_actor
    end,
    jsonb_build_object(
      'route', case
        when new.type = 'follow' then 'profile'
        when new.type = 'tag' and v_c.id is not null then 'camera'
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

-- 7. Who a user may tag: people who follow them back, not blocked either way, not banned.
create function public.taggable_friends(p_user uuid)
returns table (id uuid, has_open_tag boolean)
language sql
stable
security definer
set search_path = public
as $$
  select f.following_id,
         exists (
           select 1 from public.tag_challenges c
           where c.tagger_id = p_user and c.tagged_id = f.following_id
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
         )
  from public.follows f
  join public.follows back
    on back.follower_id = f.following_id and back.following_id = p_user
  join public.profiles pr on pr.id = f.following_id and not pr.is_banned
  where f.follower_id = p_user
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_user and b.blocked_id = f.following_id)
         or (b.blocker_id = f.following_id and b.blocked_id = p_user)
    );
$$;

create function public.get_taggable_friends(p_query text default '', p_limit int default 50)
returns table (id uuid, username text, display_name text, avatar_url text, has_open_tag boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, t.has_open_tag
  from public.taggable_friends(auth.uid()) t
  join public.profiles p on p.id = t.id
  where coalesce(p_query, '') = ''
     or strpos(lower(p.username), lower(p_query)) > 0
     or strpos(lower(coalesce(p.display_name, '')), lower(p_query)) > 0
  order by t.has_open_tag, p.username
  limit least(greatest(p_limit, 1), 100);
$$;

-- 8. A new post answers the poster's open tags (any app version).
create function public.answer_tags_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

create trigger answer_tags_on_post
  after insert on public.posts
  for each row execute function public.answer_tags_on_post();

-- 9. Deleting a post cancels its open tags (answered ones keep their history).
create function public.cancel_tags_on_post_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with cancelled as (
    update public.tag_challenges
    set cancelled_at = now()
    where post_id = old.id
      and answered_at is null and cancelled_at is null and missed_at is null
    returning id
  )
  delete from public.push_outbox o using cancelled c
  where o.challenge_id = c.id and o.sent_at is null;
  return old;
end;
$$;

create trigger cancel_tags_on_post_delete
  before delete on public.posts
  for each row execute function public.cancel_tags_on_post_delete();

-- 10. Blocking cancels open tags between the pair.
create function public.cancel_tags_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with cancelled as (
    update public.tag_challenges
    set cancelled_at = now()
    where answered_at is null and cancelled_at is null and missed_at is null
      and ((tagger_id = new.blocker_id and tagged_id = new.blocked_id)
        or (tagger_id = new.blocked_id and tagged_id = new.blocker_id))
    returning id
  )
  delete from public.push_outbox o using cancelled c
  where o.challenge_id = c.id and o.sent_at is null;
  return new;
end;
$$;

create trigger cancel_tags_on_block
  after insert on public.user_blocks
  for each row execute function public.cancel_tags_on_block();

-- 11. The one posting path for the new app.
create function public.create_post(
  p_client_id uuid,
  p_image_path text,
  p_pov_image_path text default null,
  p_caption text default null,
  p_tagged_ids uuid[] default '{}',
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_profile public.profiles;
  v_post public.posts;
  v_today date;
  v_streak jsonb;
  v_tags uuid[] := array(select distinct t from unnest(coalesce(p_tagged_ids, '{}')) t);
  v_available int;
  v_required int;
  v_new_ids uuid[];
  v_base text;
  v_has_coords boolean := p_latitude is not null and p_longitude is not null;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;

  -- Serialise everything this user does from here on (double taps, two devices).
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.is_banned then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Idempotent retry: same client id → the post that was already made.
  select * into v_post from public.posts where client_id = p_client_id and user_id = v_uid;
  if found then
    return jsonb_build_object(
      'post', to_jsonb(v_post),
      'streak', jsonb_build_object(
        'streak_current', v_profile.streak_current,
        'streak_highest', v_profile.streak_highest,
        'streak_lowest', v_profile.streak_lowest),
      'answered', public.answered_by_post(v_post.id),
      'replayed', true
    );
  end if;

  v_today := (now() at time zone v_profile.timezone)::date;
  if exists (select 1 from public.posts where user_id = v_uid and post_date = v_today) then
    raise exception 'already posted today' using errcode = 'P0001';
  end if;

  if p_image_path is null
     or split_part(p_image_path, '/', 1) <> v_uid::text
     or not exists (select 1 from storage.objects where bucket_id = 'posts' and name = p_image_path)
     or (p_pov_image_path is not null and (
           split_part(p_pov_image_path, '/', 1) <> v_uid::text
           or not exists (select 1 from storage.objects where bucket_id = 'posts' and name = p_pov_image_path)))
  then
    raise exception 'photo not found' using errcode = '22023';
  end if;

  -- Expired tags from this user no longer block re-tagging the same friend.
  update public.tag_challenges c
  set missed_at = now()
  where c.tagger_id = v_uid
    and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
    and c.expires_at + v_cfg.answer_grace < now();

  select count(*) into v_available from public.taggable_friends(v_uid) where not has_open_tag;
  v_required := case when v_cfg.tags_required then least(v_cfg.tag_count, v_available) else 0 end;
  if cardinality(v_tags) < v_required or cardinality(v_tags) > greatest(v_cfg.tag_count, 1) then
    raise exception 'tag % friends', v_required
      using errcode = '22023', detail = json_build_object('required', v_required)::text;
  end if;
  if exists (
    select 1 from unnest(v_tags) t(id)
    where t.id not in (select f.id from public.taggable_friends(v_uid) f where not f.has_open_tag)
  ) then
    raise exception 'cannot tag that person' using errcode = '22023';
  end if;

  v_streak := public.record_upload_streak(v_uid, v_today);

  v_base := v_cfg.storage_public_url || '/posts/';
  insert into public.posts (
    user_id, client_id, image_url, pov_image_url, image_path, pov_image_path,
    caption, streak_day, latitude, longitude
  )
  values (
    v_uid, p_client_id, v_base || p_image_path,
    case when p_pov_image_path is not null then v_base || p_pov_image_path end,
    p_image_path, p_pov_image_path,
    nullif(btrim(p_caption), ''),
    (v_streak ->> 'streak_current')::int,
    case when v_has_coords then p_latitude end,
    case when v_has_coords then p_longitude end
  )
  returning * into v_post;
  -- (answer_tags_on_post has now answered this user's open tags)

  with created as (
    insert into public.tag_challenges (post_id, tagger_id, tagged_id, expires_at)
    select v_post.id, v_uid, t, now() + v_cfg.tag_window from unnest(v_tags) t
    returning id
  )
  select array_agg(id) into v_new_ids from created;

  -- Tag bubbles; notify_on_tag turns each into a notification and its deadline push.
  insert into public.post_tags (post_id, user_id) select v_post.id, unnest(v_tags);

  perform public.enqueue_push(
    c.tagged_id, v_uid, 'tag_reminder', r.hours_left || ' hours left to answer @' || v_profile.username,
    jsonb_build_object('route', 'camera'),
    c.expires_at - make_interval(hours => r.hours_left),
    'tag:' || c.id || ':' || r.hours_left || 'h',
    c.id,
    c.expires_at
  )
  from public.tag_challenges c
  cross join (values (24), (2)) r(hours_left)
  where c.id = any(v_new_ids);

  return jsonb_build_object(
    'post', to_jsonb(v_post),
    'streak', v_streak,
    'answered', public.answered_by_post(v_post.id),
    'replayed', false
  );
end;
$$;

-- Tags a post answered, oldest first: [{tagger_id, username, seconds}]
create function public.answered_by_post(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'tagger_id', c.tagger_id,
           'username', p.username,
           'seconds', extract(epoch from c.answered_at - c.created_at)::int
         ) order by c.created_at), '[]'::jsonb)
  from public.tag_challenges c
  join public.profiles p on p.id = c.tagger_id
  where c.answered_post_id = p_post_id;
$$;

-- 12. Reads for the app.
create function public.get_open_tags()
returns table (
  challenge_id uuid, tagger_id uuid, username text, display_name text, avatar_url text,
  created_at timestamptz, expires_at timestamptz, server_now timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, p.id, p.username, p.display_name, p.avatar_url, c.created_at, c.expires_at, now()
  from public.tag_challenges c
  join public.profiles p on p.id = c.tagger_id
  cross join public.app_config cfg
  where c.tagged_id = auth.uid()
    and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
    and now() <= c.expires_at + cfg.answer_grace
  order by c.expires_at;
$$;

-- For feed cards: how fast each post answered its oldest tag.
create function public.get_post_responses(p_post_ids uuid[])
returns table (post_id uuid, tagger_username text, seconds int)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (c.answered_post_id)
         c.answered_post_id, p.username, extract(epoch from c.answered_at - c.created_at)::int
  from public.tag_challenges c
  join public.profiles p on p.id = c.tagger_id
  where c.answered_post_id = any(p_post_ids)
  order by c.answered_post_id, c.created_at;
$$;

-- 13. Deadlines that passed: mark missed and tell both people. Correctness never waits on this
--     job (every check compares expires_at with now()); it only announces.
create function public.mark_missed_tags()
returns void
language sql
security definer
set search_path = public
as $$
  with due as (
    select c.id
    from public.tag_challenges c
    cross join public.app_config cfg
    where c.answered_at is null and c.cancelled_at is null and c.missed_notified_at is null
      and c.expires_at + cfg.answer_grace < now()
    for update of c skip locked
  ),
  marked as (
    update public.tag_challenges c
    set missed_at = coalesce(c.missed_at, now()), missed_notified_at = now()
    from due
    where c.id = due.id
    returning c.id, c.post_id, c.tagger_id, c.tagged_id
  )
  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  select tagger_id, tagged_id, 'tag_missed', post_id, id from marked
  union all
  select tagged_id, tagger_id, 'tag_missed', post_id, id from marked;
$$;

select cron.schedule('mark-missed-tags', '*/5 * * * *', $$select public.mark_missed_tags()$$);

-- 14. Who may call what.
revoke execute on function
  public.enqueue_push(uuid, uuid, text, text, jsonb, timestamptz, text, uuid, timestamptz),
  public.format_wait(interval),
  public.taggable_friends(uuid),
  public.get_taggable_friends(text, int),
  public.answer_tags_on_post(),
  public.cancel_tags_on_post_delete(),
  public.cancel_tags_on_block(),
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision),
  public.answered_by_post(uuid),
  public.get_open_tags(),
  public.get_post_responses(uuid[]),
  public.mark_missed_tags()
from public, anon, authenticated;

grant execute on function
  public.get_taggable_friends(text, int),
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision),
  public.get_open_tags(),
  public.get_post_responses(uuid[])
to authenticated;

notify pgrst, 'reload schema';
