-- Staff remove a message (owner, 2026-10-06): a reported message can be removed by staff, like a
-- comment. It's kept (so a mistake can be undone with staff_restore_message) but neither person
-- sees it any more: left out of get_messages, the inbox's last message and unread count, and the
-- direct table read older apps use. Every removal and restore is in the audit log.
-- Apps already on phones keep working; a removed message just stops showing (on the next load).
-- Contract: docs/moderation.md.
-- Test: supabase/tests/staff_remove_message_test.sql
-- Undo: supabase/rollbacks/20261006150000_staff_remove_message.rollback.sql

alter table public.messages
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users(id) on delete set null,
  add column removed_reason text;

-- Direct reads (older apps, realtime) leave removed messages out.
drop policy messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    removed_at is null
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

-- Nobody sends a message that is already removed, or removes one themselves.
create or replace function public.protect_message_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.removed_at is not null or new.removed_by is not null or new.removed_reason is not null) then
    raise exception 'only staff can remove a message' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_message_moderation
  before insert on public.messages
  for each row execute function public.protect_message_moderation();

create or replace function public.get_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.participant_one = v_uid or c.participant_two = v_uid)
  ) then
    raise exception 'not your conversation' using errcode = '42501';
  end if;

  return (
    select coalesce(
             jsonb_agg(public.message_json(s.m)
                       order by (s.m).created_at desc, (s.m).id desc),
             '[]'::jsonb)
    from (
      select m
      from public.messages m
      where m.conversation_id = p_conversation_id
        and m.removed_at is null
        and (p_before is null or p_before_id is null
             or (m.created_at, m.id) < (p_before, p_before_id))
      order by m.created_at desc, m.id desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) s
  );
end;
$$;

create or replace function public.get_inbox(p_status text default 'active')
returns table (
  id uuid,
  status text,
  initiated_by uuid,
  is_requester boolean,
  updated_at timestamptz,
  other_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_message_id uuid,
  last_message text,
  last_message_sender uuid,
  last_message_at timestamptz,
  unread_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.status, c.initiated_by, c.initiated_by = auth.uid(), c.updated_at,
         o.id, o.username, o.display_name, o.avatar_url,
         m.id, m.content, m.sender_id, m.created_at,
         (select count(*)::int
          from public.messages u
          where u.conversation_id = c.id
            and u.removed_at is null
            and u.sender_id <> auth.uid()
            and u.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz))
  from public.conversations c
  join public.profiles o
    on o.id = case when c.participant_one = auth.uid()
                   then c.participant_two else c.participant_one end
   and not o.is_banned
  left join public.conversation_reads r
    on r.conversation_id = c.id and r.user_id = auth.uid()
  left join lateral (
    select m2.id, m2.content, m2.sender_id, m2.created_at
    from public.messages m2
    where m2.conversation_id = c.id
      and m2.removed_at is null
    order by m2.created_at desc, m2.id desc
    limit 1
  ) m on true
  where (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    and c.status = coalesce(p_status, 'active')
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = o.id)
         or (b.blocker_id = o.id and b.blocked_id = auth.uid())
    )
  order by c.updated_at desc;
$$;

-- Staff see whether a reported message was removed, and why.
create or replace function public.report_item(r public.user_reports)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'source', r.source,
    'reason', r.reason,
    'details', r.description,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'reviewed_by', r.reviewed_by,
    'reviewed_at', r.reviewed_at,
    'resolution_note', r.resolution_note,
    'ai_labels', to_jsonb(r.ai_labels),
    'ai_scores', r.ai_scores,
    'target_type', r.target_type,
    'target_id', r.target_id,
    'snapshot', r.snapshot,
    'reporter', (select jsonb_build_object('id', p.id, 'username', p.username)
                 from public.profiles p where p.id = r.reporter_id),
    'owner', (select jsonb_build_object('id', p.id, 'username', p.username,
                                        'display_name', p.display_name, 'avatar_url', p.avatar_url,
                                        'is_banned', p.is_banned)
              from public.profiles p where p.id = r.target_owner_id),
    'target', case r.target_type
      when 'post' then (select jsonb_build_object(
          'id', x.id, 'caption', x.caption, 'image_path', x.image_path,
          'pov_image_path', x.pov_image_path, 'rear_media_type', x.rear_media_type,
          'front_media_type', x.front_media_type, 'created_at', x.created_at,
          'hidden_at', x.hidden_at, 'hidden_reason', x.hidden_reason)
        from public.posts x where x.id = r.target_id)
      when 'comment' then (select jsonb_build_object(
          'id', x.id, 'post_id', x.post_id, 'content', x.content, 'created_at', x.created_at,
          'removed_at', x.removed_at, 'removed_reason', x.removed_reason)
        from public.post_comments x where x.id = r.target_id)
      when 'message' then (select jsonb_build_object(
          'id', x.id, 'conversation_id', x.conversation_id, 'content', x.content,
          'created_at', x.created_at, 'removed_at', x.removed_at, 'removed_reason', x.removed_reason)
        from public.messages x where x.id = r.target_id)
      when 'user' then (select jsonb_build_object(
          'id', x.id, 'username', x.username, 'display_name', x.display_name,
          'avatar_url', x.avatar_url, 'is_banned', x.is_banned)
        from public.profiles x where x.id = r.target_id)
    end,
    'open_reports_on_target', (
      select count(*) from public.user_reports o
      where o.target_type = r.target_type and o.target_id = r.target_id
        and o.status in ('open', 'reviewing'))
  );
$$;

create function public.staff_remove_message(p_message_id uuid, p_reason text, p_report_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  perform public.require_staff();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  update public.messages set removed_at = now(), removed_by = auth.uid(), removed_reason = p_reason
  where id = p_message_id and removed_at is null;
  if not found and not exists (select 1 from public.messages where id = p_message_id) then
    raise exception 'that message does not exist' using errcode = '22023';
  end if;
  v_n := public.close_reports('message', p_message_id, 'actioned', p_reason, p_report_id);
  perform public.log_moderation_action('remove_message', 'message', p_message_id, p_report_id, p_reason);
  return jsonb_build_object('ok', true, 'reports_closed', v_n);
end;
$$;

create function public.staff_restore_message(p_message_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  update public.messages set removed_at = null, removed_by = null, removed_reason = null
  where id = p_message_id;
  if not found then
    raise exception 'that message does not exist' using errcode = '22023';
  end if;
  perform public.log_moderation_action('restore_message', 'message', p_message_id, null, p_reason);
  return jsonb_build_object('ok', true, 'reports_closed', 0);
end;
$$;

revoke execute on function
  public.staff_remove_message(uuid, text, uuid),
  public.staff_restore_message(uuid, text),
  public.protect_message_moderation()
from public, anon, authenticated;
grant execute on function
  public.staff_remove_message(uuid, text, uuid),
  public.staff_restore_message(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
