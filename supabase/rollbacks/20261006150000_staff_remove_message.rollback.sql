-- Undo 20261006150000_staff_remove_message: removed messages show again, and the staff calls,
-- the trigger and the columns go. get_messages, get_inbox (20260917120414_messages) and
-- report_item (20261006100000_moderation) as they were.
drop function public.staff_remove_message(uuid, text, uuid);
drop function public.staff_restore_message(uuid, text);
drop trigger protect_message_moderation on public.messages;
drop function public.protect_message_moderation();

drop policy messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

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
          'created_at', x.created_at)
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

alter table public.messages
  drop column removed_at,
  drop column removed_by,
  drop column removed_reason;

notify pgrst, 'reload schema';
