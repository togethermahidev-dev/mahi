-- In-app account deletion (flag account-delete). The delete-account function removes the
-- person's photos from storage, then deletes their auth user; every table that points at them
-- already has ON DELETE CASCADE except conversations.initiated_by (checked against prod on
-- 2026-10-01). Deleting still works today because the person who started a chat is always one
-- of its two members, whose links do cascade — this makes the rule explicit so it never depends
-- on that. Test: supabase/tests/account_delete_test.sql

alter table public.conversations
  drop constraint conversations_initiated_by_fkey,
  add constraint conversations_initiated_by_fkey
    foreign key (initiated_by) references public.profiles(id) on delete cascade;
