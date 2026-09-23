-- Undo 20260923214300_friends.
begin;
drop function public.get_friends(uuid, int, int);
commit;
