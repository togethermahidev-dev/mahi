-- Undo 20261006190000_message_requests: the new calls, the send rule trigger and the columns go;
-- message_json and send_message as in 20260917120414_messages; protect_message_moderation,
-- get_messages and get_inbox as in 20261006150000_staff_remove_message. Unsent messages stay
-- empty (their words were not kept); edited ones keep the edit.
drop function public.get_conversation_with(uuid);
drop function public.unsend_message(uuid);
drop function public.edit_message(uuid, text);
drop function public.decline_message_request(uuid);
drop function public.accept_message_request(uuid);
drop function public.answer_message_request(uuid, boolean);
drop function public.start_conversation(uuid, uuid, text);
drop trigger enforce_message_send on public.messages;
drop function public.enforce_message_send();

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

create or replace function public.message_json(m public.messages)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'sender_id', m.sender_id,
    'content', m.content,
    'client_id', m.client_id,
    'created_at', m.created_at
  );
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_client_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_status text;
  v_text text := btrim(coalesce(p_content, ''));
  v_msg public.messages;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'a message needs a client id' using errcode = '22023';
  end if;
  if length(v_text) < 1 or length(v_text) > 2000 then
    raise exception 'a message is 1 to 2000 characters' using errcode = '22023';
  end if;

  select c.status,
         case when c.participant_one = v_uid then c.participant_two else c.participant_one end
    into v_status, v_other
  from public.conversations c
  where c.id = p_conversation_id
    and (c.participant_one = v_uid or c.participant_two = v_uid);
  if not found then
    raise exception 'not your conversation' using errcode = '42501';
  end if;

  if v_status = 'blocked' or exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = v_other)
       or (b.blocker_id = v_other and b.blocked_id = v_uid)
  ) then
    raise exception 'this conversation is closed' using errcode = '42501';
  end if;

  insert into public.messages (conversation_id, sender_id, content, client_id)
  values (p_conversation_id, v_uid, v_text, p_client_id)
  on conflict (client_id) do nothing
  returning * into v_msg;

  if not found then
    -- A retry: hand back the message the first attempt made, and send no second push.
    select * into v_msg from public.messages
    where client_id = p_client_id and sender_id = v_uid and conversation_id = p_conversation_id;
    if not found then
      raise exception 'that client id belongs to another message' using errcode = '42501';
    end if;
    return public.message_json(v_msg);
  end if;

  -- One push per sender per conversation per minute, so a burst is one push.
  select coalesce(display_name, username) into v_name from public.profiles where id = v_uid;
  perform public.enqueue_push(
    v_other,
    v_uid,
    'message',
    v_name || ' sent you a message',
    jsonb_build_object(
      'route', 'conversation',
      'conversation_id', p_conversation_id,
      'user_id', v_uid
    ),
    now(),
    'message:' || p_conversation_id || ':' || v_uid || ':'
      || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI')
  );

  return public.message_json(v_msg);
end;
$$;

drop function public.check_can_send(uuid, uuid);
drop function public.are_friends(uuid, uuid);

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

alter table public.messages drop column edited_at, drop column unsent_at;
alter table public.conversations drop column declined_at;
grant update, delete, truncate on public.messages to authenticated;

notify pgrst, 'reload schema';
