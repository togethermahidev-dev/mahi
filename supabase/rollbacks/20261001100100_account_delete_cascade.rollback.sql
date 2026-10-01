-- Undo 20261001100100_account_delete_cascade: the chat starter link goes back to no action.
begin;
alter table public.conversations
  drop constraint conversations_initiated_by_fkey,
  add constraint conversations_initiated_by_fkey
    foreign key (initiated_by) references public.profiles(id);
delete from supabase_migrations.schema_migrations where version = '20261001100100';
commit;
