-- Undo 20260917112413_tag_challenges. All challenges and their notifications are lost.
-- Restores enqueue_push and push_on_notification exactly as 20260917111346_push left them.
begin;

select cron.unschedule('mark-missed-tags');

drop trigger if exists cancel_tags_on_block on public.user_blocks;
drop trigger if exists cancel_tags_on_post_delete on public.posts;
drop trigger if exists answer_tags_on_post on public.posts;

drop function if exists public.mark_missed_tags();
drop function if exists public.get_post_responses(uuid[]);
drop function if exists public.get_open_tags();
drop function if exists public.create_post(uuid, text, text, text, uuid[], double precision, double precision);
drop function if exists public.answered_by_post(uuid);
drop function if exists public.cancel_tags_on_block();
drop function if exists public.cancel_tags_on_post_delete();
drop function if exists public.answer_tags_on_post();
drop function if exists public.get_taggable_friends(text, int);
drop function if exists public.taggable_friends(uuid);

delete from public.notifications where type in ('tag_answered', 'tag_missed');
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'tag'));
alter table public.notifications drop column challenge_id;
alter table public.push_outbox drop column challenge_id;
drop table public.tag_challenges;

drop function public.enqueue_push(uuid, uuid, text, text, jsonb, timestamptz, text, uuid, timestamptz);
create function public.enqueue_push(
  p_user uuid, p_actor uuid, p_kind text, p_body text, p_data jsonb,
  p_send_after timestamptz default now(), p_dedupe_key text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
begin
  if p_actor is not null and (
    p_actor = p_user
    or exists (select 1 from public.user_blocks
               where (blocker_id = p_user and blocked_id = p_actor)
                  or (blocker_id = p_actor and blocked_id = p_user))
    or exists (select 1 from public.profiles where id = p_actor and is_banned)
  ) then
    return;
  end if;
  select timezone into v_tz from public.profiles where id = p_user and not is_banned;
  if not found then
    return;
  end if;
  insert into public.push_outbox (user_id, kind, body, data, send_after, dedupe_key)
  values (p_user, p_kind, p_body, coalesce(p_data, '{}'), public.push_send_time(p_send_after, v_tz), p_dedupe_key)
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke execute on function public.enqueue_push(uuid, uuid, text, text, jsonb, timestamptz, text)
  from public, anon, authenticated;

create or replace function public.push_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
begin
  select '@' || username into v_actor from public.profiles where id = new.actor_id;
  perform public.enqueue_push(
    new.user_id, new.actor_id, new.type,
    case new.type
      when 'like' then v_actor || ' liked your post'
      when 'comment' then v_actor || ' commented on your post'
      when 'follow' then v_actor || ' started following you'
      when 'tag' then v_actor || ' tagged you in a post'
      else v_actor
    end,
    jsonb_build_object(
      'route', case when new.type = 'follow' then 'profile' else 'post' end,
      'post_id', new.post_id, 'user_id', new.actor_id, 'notification_id', new.id),
    now(),
    'notification:' || new.id
  );
  return new;
end;
$$;

drop function if exists public.format_wait(interval);

alter table public.posts
  drop column if exists pov_image_path,
  drop column if exists image_path,
  drop column if exists client_id;

alter table public.app_config
  drop column storage_public_url,
  drop column answer_grace,
  drop column tag_window,
  drop column tags_required,
  drop column tag_count;

delete from supabase_migrations.schema_migrations where version = '20260917112413';

commit;
