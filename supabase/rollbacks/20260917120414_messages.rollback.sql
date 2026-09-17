-- Undo 20260917120414_messages. Unread marks are lost; message client ids are lost.
-- Restores the conversation and message policies and the updated_at trigger as they were.
begin;

drop function if exists public.get_inbox(text);
drop function if exists public.mark_conversation_read(uuid);
drop function if exists public.get_messages(uuid, timestamptz, uuid, int);
drop function if exists public.send_message(uuid, uuid, text);
drop function if exists public.message_json(public.messages);

drop table if exists public.conversation_reads;

drop index if exists public.messages_client_id_key;
alter table public.messages drop column if exists client_id;

-- The bookkeeping trigger goes back to running as the caller.
create or replace function public.update_convo_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using (
    participant_one = auth.uid() or participant_two = auth.uid()
  )
  with check (
    (status = 'active' and initiated_by <> auth.uid())
    or (participant_one = auth.uid() or participant_two = auth.uid())
  );

-- Back to the CHECK that blocking trips over.
alter table public.conversations drop constraint if exists conversations_pre_block_status_check;
alter table public.conversations drop constraint conversations_status_check;
update public.conversations
set status = coalesce(pre_block_status, 'requested'), pre_block_status = null
where status = 'blocked';
alter table public.conversations add constraint conversations_status_check
  check (status in ('requested', 'active'));

notify pgrst, 'reload schema';
commit;
