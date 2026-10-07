-- Undo 20261007111029_contract_messages: restore the old messaging path so old app builds
-- can still send/update/delete messages and conversations directly.

grant insert on public.messages to authenticated;
grant insert, update, delete on public.conversations to authenticated;

notify pgrst, 'reload schema';
