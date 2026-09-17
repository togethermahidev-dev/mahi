-- Messages hardening (tag-loop plan, Phase 6, expand step).
-- One send path (send_message) that is safe to retry, a paged read, server-side unread counts,
-- one push per burst, and blocks that actually hold. Old app builds keep their direct INSERT
-- until the contract step (supabase/deferred/contract_messages.sql).
-- Test: supabase/tests/messages_test.sql

-- 1. Blocking someone you have a conversation with fails today: handle_new_block writes
--    status 'blocked' but the CHECK only allows 'requested' and 'active'.
--    (Checked against prod 2026-09-17: 13 conversations, 0 blocks — nobody has hit it yet.)
alter table public.conversations drop constraint conversations_status_check;
alter table public.conversations add constraint conversations_status_check
  check (status in ('requested', 'active', 'blocked'));
alter table public.conversations add constraint conversations_pre_block_status_check
  check (pre_block_status is null or pre_block_status in ('requested', 'active'));

-- 2. A retry carries the client's id, so it lands on the message it already made.
alter table public.messages add column client_id uuid;
create unique index messages_client_id_key on public.messages (client_id);

-- 3. Where each person got to in each conversation. Written by RPC only.
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_reads enable row level security;
revoke all on public.conversation_reads from anon, authenticated;
grant select on public.conversation_reads to authenticated;
create policy conversation_reads_select on public.conversation_reads
  for select to authenticated using (user_id = auth.uid());

-- 4. The inbox-order bookkeeping is the server's write, not the sender's, so tightening the
--    conversation UPDATE policy below cannot break an old build's direct insert.
create or replace function public.update_convo_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

-- 5. Only the person who received a request can accept it, and a blocked conversation is frozen.
drop policy conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using (
    (participant_one = auth.uid() or participant_two = auth.uid())
    and status <> 'blocked'
  )
  with check (
    (participant_one = auth.uid() or participant_two = auth.uid())
    and status in ('requested', 'active')
    and (status <> 'active' or initiated_by <> auth.uid())
  );

-- 6. A block stops the old direct-insert path too.
drop policy messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
        and c.status <> 'blocked'
    )
  );

-- 7. One message as the app sees it.
create function public.message_json(m public.messages)
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

-- 8. The one write path. Same client id twice = the same message, once.
create function public.send_message(
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

-- 9. One page of a conversation, newest first. Page again with the last item's created_at and id.
create function public.get_messages(
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

-- 10. Caught up to here.
create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
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

  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation_id, v_uid, now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
end;
$$;

-- 11. The inbox (or the request list) in one query: other person, last message, unread count.
create function public.get_inbox(p_status text default 'active')
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

revoke execute on function
  public.message_json(public.messages),
  public.send_message(uuid, uuid, text),
  public.get_messages(uuid, timestamptz, uuid, int),
  public.mark_conversation_read(uuid),
  public.get_inbox(text)
from public, anon, authenticated;

grant execute on function
  public.send_message(uuid, uuid, text),
  public.get_messages(uuid, timestamptz, uuid, int),
  public.mark_conversation_read(uuid),
  public.get_inbox(text)
to authenticated;

notify pgrst, 'reload schema';
