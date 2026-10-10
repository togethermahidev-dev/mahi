-- Undo 20261010100000_share_post_in_message: message_json and get_inbox as
-- 20261006190000_message_requests, get_messages as 20261007280000_message_reactions; share_post,
-- shared_post_json and messages.post_id go (a message that carried a post keeps its note).
begin;

drop function if exists public.share_post(uuid, uuid[], uuid, text);

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

drop function if exists public.shared_post_json(uuid, uuid);
alter table public.messages drop column if exists post_id;

notify pgrst, 'reload schema';
delete from supabase_migrations.schema_migrations where version = '20261010100000';

commit;
