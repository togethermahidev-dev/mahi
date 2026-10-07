-- Undo 20261007280000_message_reactions: reactions on messages go, and get_messages goes back to
-- 20261006190000_message_requests's body (production's before this change). Apps that read
-- `reactions` treat it as missing and show none. The reaction rows are dropped with the table.
begin;

alter publication supabase_realtime drop table public.message_reactions;

drop function if exists public.react_to_message(uuid, text);
drop function if exists public.get_message_reactions(uuid);
drop function if exists public.message_reactions_json(uuid, uuid);
drop function if exists public.check_can_react(uuid, uuid);
drop table if exists public.message_reactions;

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

notify pgrst, 'reload schema';
commit;
