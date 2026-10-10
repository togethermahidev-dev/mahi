-- Reactions on messages (owner, 2026-10-07: hold a message to react with an emoji).
-- * One reaction per person per message. The same emoji again takes it off; a different one
--   replaces it. Everything goes through react_to_message; nobody writes the rows directly.
-- * Only the two people in the chat can react or see reactions, and the same closed doors as
--   sending apply: a waiting request (either side), a block, a ban, a message gone (unsent or
--   removed by staff). Reactions are deleted with their message.
-- * get_messages carries each message's reactions as [{emoji, count, mine}], first reaction first.
--   message_json itself is unchanged, so send_message / edit_message hand back the same row as
--   before. The table is in the realtime publication: the app listens and re-reads one message's
--   reactions (get_message_reactions) when they change.
-- Test: supabase/tests/message_reactions_test.sql
-- Undo: supabase/rollbacks/20261007280000_message_reactions.rollback.sql

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  -- Copied from the message so the app can listen to one chat's reactions.
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  -- clock_timestamp, not now(): two reactions in one transaction (tests) still keep their order.
  created_at timestamptz not null default clock_timestamp(),
  primary key (message_id, user_id)
);
create index message_reactions_conversation_idx on public.message_reactions (conversation_id);

alter table public.message_reactions enable row level security;

-- The two people in the chat read them (the app's live listener needs this).
create policy message_reactions_select on public.message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = message_reactions.conversation_id
        and (c.participant_one = (select auth.uid()) or c.participant_two = (select auth.uid()))
    )
  );
grant select on public.message_reactions to authenticated;
revoke insert, update, delete, truncate on public.message_reactions from authenticated, anon;

-- Writes come from the server only (react_to_message runs as its owner).
create function public.protect_message_reactions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'reactions are made through the app' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger protect_message_reactions
  before insert or update or delete on public.message_reactions
  for each row execute function public.protect_message_reactions();
revoke execute on function public.protect_message_reactions() from public, anon, authenticated;

-- A message's reactions as the app shows them: [{emoji, count, mine}], first reaction first.
create function public.message_reactions_json(p_message_id uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           jsonb_agg(jsonb_build_object('emoji', g.emoji, 'count', g.n, 'mine', g.mine)
                     order by g.first_at, g.emoji collate "C"),
           '[]'::jsonb)
  from (
    select r.emoji,
           count(*)::int as n,
           bool_or(r.user_id = p_viewer) as mine,
           min(r.created_at) as first_at
    from public.message_reactions r
    where r.message_id = p_message_id
    group by r.emoji
  ) g;
$$;

-- Read one message's reactions (the app does this when they change live).
create function public.get_message_reactions(p_message uuid)
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
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message and (c.participant_one = v_uid or c.participant_two = v_uid)
  ) then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  return public.message_reactions_json(p_message, v_uid);
end;
$$;

-- React to a message: the same emoji again takes yours off, a different one replaces it.
-- Hands back the message's reactions afterwards (the app shows these, not its own guess).
create function public.react_to_message(p_message uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emoji text := btrim(coalesce(p_emoji, ''));
  m public.messages;
  c public.conversations;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- One emoji (a family or flag is several code points, never more than 16); no letters or digits.
  if v_emoji = '' or length(v_emoji) > 16 or v_emoji ~ '[ -~]' then
    raise exception 'pick one emoji' using errcode = '22023';
  end if;

  select * into m from public.messages where id = p_message for update;
  if not found or m.removed_at is not null or m.unsent_at is not null then
    raise exception 'message gone' using errcode = 'P0002';
  end if;
  select * into c from public.conversations where id = m.conversation_id;
  if c.participant_one <> v_uid and c.participant_two <> v_uid then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  v_other := case when c.participant_one = v_uid then c.participant_two else c.participant_one end;

  -- The same doors as send_message (check_can_send), without turning a request into a chat.
  if c.status = 'blocked'
     or exists (select 1 from public.user_blocks b
                where (b.blocker_id = v_uid and b.blocked_id = v_other)
                   or (b.blocker_id = v_other and b.blocked_id = v_uid))
     or exists (select 1 from public.profiles p where p.id in (v_uid, v_other) and p.is_banned) then
    raise exception 'this conversation is closed' using errcode = '42501';
  end if;
  if c.status = 'requested' then
    if c.initiated_by = v_uid then
      raise exception 'waiting for them to accept' using errcode = '42501';
    end if;
    raise exception 'accept the request first' using errcode = '42501';
  end if;

  delete from public.message_reactions
  where message_id = m.id and user_id = v_uid and emoji = v_emoji;
  if not found then
    insert into public.message_reactions (message_id, conversation_id, user_id, emoji)
    values (m.id, m.conversation_id, v_uid, v_emoji)
    on conflict (message_id, user_id)
      do update set emoji = excluded.emoji, created_at = clock_timestamp();
  end if;

  return public.message_reactions_json(m.id, v_uid);
end;
$$;

-- Messages come with their reactions. Everything else about them is as before.
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
                       || jsonb_build_object('reactions', public.message_reactions_json((s.m).id, v_uid))
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

-- The app listens to one chat's reactions as they change.
alter publication supabase_realtime add table public.message_reactions;

notify pgrst, 'reload schema';
