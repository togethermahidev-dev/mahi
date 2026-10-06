-- Message requests, edits and unsends (owner, 2026-10-06: work like PingMee-v2, the server is the truth).
-- * A request is a message: opening a chat makes nothing. The first message from someone who
--   isn't a friend (people who follow each other) makes a request; friends go straight to the inbox.
-- * While a request waits, the sender can't send more ("Waiting for @x to accept") and the
--   receiver accepts, declines or blocks before replying. Declining is quiet: it leaves the
--   receiver's requests and the sender still sees it waiting.
-- * The sender edits their own message for 15 minutes (shown "Edited") or unsends it (gone for
--   both, its words not kept). A message staff removed can be neither.
-- * Everything goes through these functions; nobody updates or deletes messages directly.
-- Old apps keep working: their direct conversation insert/update/delete stay until the contract
-- step (supabase/deferred/contract_messages.sql). An empty request (opened, never sent) is hidden.
-- Test: supabase/tests/message_requests_test.sql
-- Undo: supabase/rollbacks/20261006190000_message_requests.rollback.sql

alter table public.conversations add column declined_at timestamptz;
alter table public.messages
  add column edited_at timestamptz,
  add column unsent_at timestamptz;

-- Nobody writes to messages except through the functions below.
revoke update, delete, truncate on public.messages from authenticated, anon;

-- Edits and unsends come from the server only.
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
  if current_user in ('authenticated', 'anon')
     and (new.edited_at is not null or new.unsent_at is not null) then
    raise exception 'messages are edited and unsent through the app' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Friends: they follow each other.
create function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.follows where follower_id = p_a and following_id = p_b)
     and exists (select 1 from public.follows where follower_id = p_b and following_id = p_a);
$$;

-- May p_uid send into this conversation now? Raises if not; turns a request between people who
-- have since become friends into a conversation. Used by send_message and by old apps' direct insert.
create function public.check_can_send(p_conversation_id uuid, p_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
  v_other uuid;
begin
  select * into c from public.conversations
  where id = p_conversation_id and (participant_one = p_uid or participant_two = p_uid)
  for update;
  if not found then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  v_other := case when c.participant_one = p_uid then c.participant_two else c.participant_one end;

  if c.status = 'blocked'
     or exists (select 1 from public.user_blocks b
                where (b.blocker_id = p_uid and b.blocked_id = v_other)
                   or (b.blocker_id = v_other and b.blocked_id = p_uid))
     or exists (select 1 from public.profiles p where p.id in (p_uid, v_other) and p.is_banned) then
    raise exception 'this conversation is closed' using errcode = '42501';
  end if;

  if c.status = 'requested' then
    if public.are_friends(p_uid, v_other) then
      update public.conversations set status = 'active', declined_at = null where id = c.id;
    elsif c.initiated_by = p_uid then
      -- The request is one message: the first is fine, the rest wait for an answer.
      if exists (select 1 from public.messages m
                 where m.conversation_id = c.id and m.sender_id = p_uid and m.unsent_at is null) then
        raise exception 'waiting for them to accept' using errcode = '42501';
      end if;
    else
      raise exception 'accept the request first' using errcode = '42501';
    end if;
  end if;
  return v_other;
end;
$$;

-- Old apps insert directly: the same rules hold for them. (Staff and server jobs have no user.)
create function public.enforce_message_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    perform public.check_can_send(new.conversation_id, auth.uid());
  end if;
  return new;
end;
$$;
create trigger enforce_message_send
  before insert on public.messages
  for each row execute function public.enforce_message_send();

-- One message as the app sees it.
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
    'created_at', m.created_at,
    'edited_at', m.edited_at,
    'unsent_at', m.unsent_at
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
  v_text text := btrim(coalesce(p_content, ''));
  v_msg public.messages;
  v_name text;
  v_request boolean;
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

  -- A retry: hand back the message the first attempt made, and send no second push.
  select * into v_msg from public.messages where client_id = p_client_id;
  if found then
    if v_msg.sender_id <> v_uid or v_msg.conversation_id <> p_conversation_id then
      raise exception 'that client id belongs to another message' using errcode = '42501';
    end if;
    return public.message_json(v_msg);
  end if;

  v_other := public.check_can_send(p_conversation_id, v_uid);

  insert into public.messages (conversation_id, sender_id, content, client_id)
  values (p_conversation_id, v_uid, v_text, p_client_id)
  returning * into v_msg;

  select status = 'requested' into v_request from public.conversations where id = p_conversation_id;

  -- One push per sender per conversation per minute, so a burst is one push.
  select coalesce(display_name, username) into v_name from public.profiles where id = v_uid;
  perform public.enqueue_push(
    v_other,
    v_uid,
    'message',
    v_name || case when v_request then ' sent you a message request' else ' sent you a message' end,
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

-- The first message to someone: makes the conversation (a request unless they're friends) and
-- sends it, in one step. Safe to retry with the same client id.
create function public.start_conversation(p_other uuid, p_client_id uuid, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_msg jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_other is null or p_other = v_uid then
    raise exception 'pick someone else to message' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_other and not is_banned) then
    raise exception 'you can''t message this person' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_blocks b
             where (b.blocker_id = v_uid and b.blocked_id = p_other)
                or (b.blocker_id = p_other and b.blocked_id = v_uid)) then
    raise exception 'you can''t message this person' using errcode = '42501';
  end if;

  insert into public.conversations (participant_one, participant_two, initiated_by, status)
  values (least(v_uid, p_other), greatest(v_uid, p_other), v_uid,
          case when public.are_friends(v_uid, p_other) then 'active' else 'requested' end)
  on conflict (participant_one, participant_two) do nothing;

  select id into v_id from public.conversations
  where participant_one = least(v_uid, p_other) and participant_two = greatest(v_uid, p_other);

  -- Writing to someone who sent you a request: a request opened but never sent (older apps made
  -- those) becomes yours; one with a message in it (even one you declined) you've now accepted.
  update public.conversations
  set initiated_by = case when exists (select 1 from public.messages m where m.conversation_id = v_id)
                          then initiated_by else v_uid end,
      status = case when exists (select 1 from public.messages m where m.conversation_id = v_id)
                    then 'active' else status end,
      declined_at = null
  where id = v_id and status = 'requested' and initiated_by <> v_uid;

  v_msg := public.send_message(v_id, p_client_id, p_content);
  return jsonb_build_object(
    'conversation_id', v_id,
    'status', (select status from public.conversations where id = v_id),
    'message', v_msg
  );
end;
$$;

-- The receiver answers a request.
create function public.answer_message_request(p_conversation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.conversations;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into c from public.conversations
  where id = p_conversation_id and (participant_one = v_uid or participant_two = v_uid)
  for update;
  if not found or c.initiated_by = v_uid then
    raise exception 'only the person who got the request can answer it' using errcode = '42501';
  end if;
  if c.status = 'active' and p_accept then
    return;
  end if;
  if c.status <> 'requested' or c.declined_at is not null then
    raise exception 'this request can''t be answered' using errcode = '22023';
  end if;
  if p_accept then
    update public.conversations set status = 'active' where id = c.id;
  else
    update public.conversations set declined_at = now() where id = c.id;
  end if;
end;
$$;

create function public.accept_message_request(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$ select public.answer_message_request(p_conversation_id, true); $$;

create function public.decline_message_request(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$ select public.answer_message_request(p_conversation_id, false); $$;

-- Edit your own message, within 15 minutes.
create function public.edit_message(p_message_id uuid, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_text text := btrim(coalesce(p_content, ''));
  m public.messages;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into m from public.messages where id = p_message_id for update;
  if not found then
    raise exception 'that message does not exist' using errcode = '22023';
  end if;
  if m.sender_id <> v_uid then
    raise exception 'you can only edit your own messages' using errcode = '42501';
  end if;
  if m.removed_at is not null or m.unsent_at is not null then
    raise exception 'that message is gone' using errcode = '22023';
  end if;
  if length(v_text) < 1 or length(v_text) > 2000 then
    raise exception 'a message is 1 to 2000 characters' using errcode = '22023';
  end if;
  if m.created_at < now() - interval '15 minutes' then
    raise exception 'messages can be edited for 15 minutes' using errcode = '22023';
  end if;
  if exists (select 1 from public.conversations c
             where c.id = m.conversation_id
               and (c.status = 'blocked' or exists (
                 select 1 from public.user_blocks b
                 where (b.blocker_id = c.participant_one and b.blocked_id = c.participant_two)
                    or (b.blocker_id = c.participant_two and b.blocked_id = c.participant_one)))) then
    raise exception 'this conversation is closed' using errcode = '42501';
  end if;
  if v_text = m.content then
    return public.message_json(m);
  end if;
  update public.messages set content = v_text, edited_at = now()
  where id = m.id returning * into m;
  return public.message_json(m);
end;
$$;

-- Unsend your own message: gone for both, its words not kept. Safe to repeat.
create function public.unsend_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into m from public.messages where id = p_message_id for update;
  if not found then
    raise exception 'that message does not exist' using errcode = '22023';
  end if;
  if m.sender_id <> v_uid then
    raise exception 'you can only unsend your own messages' using errcode = '42501';
  end if;
  if m.removed_at is not null then
    raise exception 'that message is gone' using errcode = '22023';
  end if;
  if m.unsent_at is null then
    update public.messages set content = '', unsent_at = now()
    where id = m.id returning * into m;
  end if;
  return public.message_json(m);
end;
$$;

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
        and m.unsent_at is null
        and (p_before is null or p_before_id is null
             or (m.created_at, m.id) < (p_before, p_before_id))
      order by m.created_at desc, m.id desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) s
  );
end;
$$;

-- Every conversation the signed-in person can see, as the inbox shows it.
-- 'active': conversations, plus requests you sent (still "requested" — declined ones too, so
-- the sender isn't told). 'requested': requests you received and haven't answered.
-- A request with no message yet is shown to nobody.
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
            and u.unsent_at is null
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
      and m2.unsent_at is null
    order by m2.created_at desc, m2.id desc
    limit 1
  ) m on true
  where (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    and case coalesce(p_status, 'active')
          when 'active' then c.status = 'active'
                          or (c.status = 'requested' and c.initiated_by = auth.uid() and m.id is not null)
          when 'requested' then c.status = 'requested' and c.initiated_by <> auth.uid()
                             and c.declined_at is null and m.id is not null
          else false
        end
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = o.id)
         or (b.blocker_id = o.id and b.blocked_id = auth.uid())
    )
  order by c.updated_at desc;
$$;

-- Your conversation with one person, if there is one (same shape as the inbox).
create function public.get_conversation_with(p_other uuid)
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
  select * from public.get_inbox('active') i where i.other_id = p_other
  union all
  select * from public.get_inbox('requested') i where i.other_id = p_other;
$$;

revoke execute on function
  public.are_friends(uuid, uuid),
  public.check_can_send(uuid, uuid),
  public.enforce_message_send(),
  public.answer_message_request(uuid, boolean),
  public.start_conversation(uuid, uuid, text),
  public.accept_message_request(uuid),
  public.decline_message_request(uuid),
  public.edit_message(uuid, text),
  public.unsend_message(uuid),
  public.get_conversation_with(uuid)
from public, anon, authenticated;

grant execute on function
  public.start_conversation(uuid, uuid, text),
  public.accept_message_request(uuid),
  public.decline_message_request(uuid),
  public.edit_message(uuid, text),
  public.unsend_message(uuid),
  public.get_conversation_with(uuid)
to authenticated;

notify pgrst, 'reload schema';
