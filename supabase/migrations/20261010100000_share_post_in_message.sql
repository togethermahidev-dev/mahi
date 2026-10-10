-- A post can be sent into a Mahi chat (owner, 2026-10-10: a share sheet like Instagram's, with a
-- grid of friends to send to).
-- 1. messages.post_id: the post a message carries (no foreign key, so a deleted post reads as
--    gone instead of turning the message into an empty one). Its words (content) are the optional
--    note and may be empty.
-- 2. share_post(post, recipients 1-10, client id, note): you can only share a post you can see;
--    each person gets it in your chat with them under the usual message rules (a friend's chat is
--    open, anyone else gets a message request; a block, a closed chat or a request still waiting is
--    skipped, not an error). A retry with the same client id sends nothing twice.
-- 3. get_messages: a message with a post also returns `post`: {id, available: true, item: the
--    feed item} when the READER may see the post by the usual rules (can_view_post_for: the
--    owner's settings, blocks, bans, moderation, the reader's feed lock; a share is no exception),
--    else {id, available: false, reason: locked | private | gone} and nothing of the post.
-- 4. get_inbox: a post with no note reads "Sent a post". message_json gains post_id.
-- Previous definitions: message_json and get_inbox from 20261006190000_message_requests;
-- get_messages from 20261007280000_message_reactions.
-- Test: supabase/tests/share_post_in_message_test.sql
-- Undo: supabase/rollbacks/20261010100000_share_post_in_message.rollback.sql

alter table public.messages add column post_id uuid;

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
    'unsent_at', m.unsent_at,
    'post_id', m.post_id
  );
$$;

-- What the reader gets for a shared post. Internal: the app reaches it only through get_messages.
create function public.shared_post_json(p_post_id uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when p.user_id = p_viewer
                or (p.hidden_at is null and public.can_view_post_for(p_viewer, p.user_id, p.id))
              then jsonb_build_object('id', p.id, 'available', true,
                                      'item', public.feed_item(p, p_viewer, false))
              when p.hidden_at is not null
              then jsonb_build_object('id', p.id, 'available', false, 'reason', 'gone')
              else jsonb_build_object('id', p.id, 'available', false,
                     'reason', case when public.viewer_is_locked(p_viewer) then 'locked' else 'private' end)
            end
     from public.posts p where p.id = p_post_id),
    jsonb_build_object('id', p_post_id, 'available', false, 'reason', 'gone'));
$$;
revoke execute on function public.shared_post_json(uuid, uuid) from public, anon, authenticated;

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
                       || case when (s.m).post_id is null then '{}'::jsonb
                               else jsonb_build_object('post', public.shared_post_json((s.m).post_id, v_uid))
                          end
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
         m.id,
         case when m.post_id is not null and m.content = '' then 'Sent a post' else m.content end,
         m.sender_id, m.created_at,
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
    select m2.id, m2.content, m2.sender_id, m2.created_at, m2.post_id
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

-- Send a post to up to ten people, each in your chat with them.
create function public.share_post(
  p_post uuid,
  p_recipients uuid[],
  p_client_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  v_to uuid[];
  v_other uuid;
  v_conv uuid;
  v_cid uuid;
  v_msg public.messages;
  v_name text;
  v_status text;
  v_sent jsonb := '[]'::jsonb;
  v_skipped uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'a share needs a client id' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_note) > 2000 then
    raise exception 'a note is up to 2000 characters' using errcode = '22023';
  end if;
  v_to := array(select distinct r from unnest(coalesce(p_recipients, '{}')) r
                where r is not null and r <> v_uid);
  if coalesce(cardinality(v_to), 0) < 1 or cardinality(v_to) > 10 then
    raise exception 'share with 1 to 10 people' using errcode = '22023';
  end if;
  -- Only a post you can see (the same answer for one that isn't there).
  if not public.can_view_post_id(p_post) then
    raise exception 'post not found' using errcode = '42501';
  end if;
  select coalesce(display_name, username) into v_name from public.profiles where id = v_uid;

  foreach v_other in array v_to loop
    -- One message per person, each with its own id made from yours, so a retry sends nothing twice.
    v_cid := md5(p_client_id::text || v_other::text)::uuid;
    select * into v_msg from public.messages where client_id = v_cid;
    if found then
      if v_msg.sender_id <> v_uid then
        raise exception 'that client id belongs to another message' using errcode = '42501';
      end if;
      v_sent := v_sent || jsonb_build_object(
        'user_id', v_other, 'conversation_id', v_msg.conversation_id,
        'status', (select status from public.conversations where id = v_msg.conversation_id),
        'message', public.message_json(v_msg));
      continue;
    end if;

    begin
      -- The same rules as a first message (start_conversation): a real person, no block either way.
      if not exists (select 1 from public.profiles where id = v_other and not is_banned)
         or exists (select 1 from public.user_blocks b
                    where (b.blocker_id = v_uid and b.blocked_id = v_other)
                       or (b.blocker_id = v_other and b.blocked_id = v_uid)) then
        raise exception 'you can''t message this person' using errcode = '42501';
      end if;

      insert into public.conversations (participant_one, participant_two, initiated_by, status)
      values (least(v_uid, v_other), greatest(v_uid, v_other), v_uid,
              case when public.are_friends(v_uid, v_other) then 'active' else 'requested' end)
      on conflict (participant_one, participant_two) do nothing;
      select id into v_conv from public.conversations
      where participant_one = least(v_uid, v_other) and participant_two = greatest(v_uid, v_other);

      -- Writing to someone who sent you a request accepts it (as start_conversation does).
      update public.conversations
      set initiated_by = case when exists (select 1 from public.messages m where m.conversation_id = v_conv)
                              then initiated_by else v_uid end,
          status = case when exists (select 1 from public.messages m where m.conversation_id = v_conv)
                        then 'active' else status end,
          declined_at = null
      where id = v_conv and status = 'requested' and initiated_by <> v_uid;

      -- A closed chat or a request still waiting raises here (and again in the insert's trigger).
      perform public.check_can_send(v_conv, v_uid);

      insert into public.messages (conversation_id, sender_id, content, client_id, post_id)
      values (v_conv, v_uid, v_note, v_cid, p_post)
      returning * into v_msg;

      select status into v_status from public.conversations where id = v_conv;
      -- One push per sender per conversation per minute, as for any message.
      perform public.enqueue_push(
        v_other,
        v_uid,
        'message',
        v_name || ' sent you a post',
        jsonb_build_object('route', 'conversation', 'conversation_id', v_conv, 'user_id', v_uid),
        now(),
        'message:' || v_conv || ':' || v_uid || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI')
      );

      v_sent := v_sent || jsonb_build_object(
        'user_id', v_other, 'conversation_id', v_conv, 'status', v_status,
        'message', public.message_json(v_msg));
    exception when insufficient_privilege then
      -- Can't be messaged (a block, a ban, a closed chat, a request waiting): skipped, nothing kept.
      v_skipped := v_skipped || v_other;
    end;
  end loop;

  return jsonb_build_object('sent', v_sent, 'skipped', to_jsonb(v_skipped));
end;
$$;
revoke execute on function public.share_post(uuid, uuid[], uuid, text) from public, anon;
grant execute on function public.share_post(uuid, uuid[], uuid, text) to authenticated;

notify pgrst, 'reload schema';
