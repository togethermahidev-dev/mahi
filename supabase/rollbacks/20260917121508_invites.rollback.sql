-- Undo 20260917121508_invites. Every invite link and every tag waiting on one is lost.
-- Restores create_post and push_on_notification as the tag_challenges migration left them.
begin;

select cron.unschedule('expire-invites');

drop function if exists public.get_invite_preview(text);
drop function if exists public.claim_invite(text);
drop function if exists public.invite_result(public.invites);
drop function if exists public.expire_invites();

-- Tags that were still waiting for someone go, so tagged_id can be NOT NULL again.
delete from public.tag_challenges where tagged_id is null or expires_at is null;
drop table if exists public.invites;
drop function if exists public.post_invites(uuid);
drop function if exists public.new_invite_code();

alter table public.tag_challenges alter column tagged_id set not null;
alter table public.tag_challenges alter column expires_at set not null;

delete from public.notifications where type = 'invite_joined';
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag', 'tag_answered', 'tag_missed'));

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

drop function public.create_post(uuid, text, text, text, uuid[], double precision, double precision, int);
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

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.is_banned then
    raise exception 'not allowed' using errcode = '42501';
  end if;

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

  with created as (
    insert into public.tag_challenges (post_id, tagger_id, tagged_id, expires_at)
    select v_post.id, v_uid, t, now() + v_cfg.tag_window from unnest(v_tags) t
    returning id
  )
  select array_agg(id) into v_new_ids from created;

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

revoke execute on function
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision)
from public, anon, authenticated;
grant execute on function
  public.create_post(uuid, text, text, text, uuid[], double precision, double precision)
to authenticated;

alter table public.app_config
  drop column invite_ttl,
  drop column invite_base_url,
  drop column invite_links_enabled;

notify pgrst, 'reload schema';
commit;
