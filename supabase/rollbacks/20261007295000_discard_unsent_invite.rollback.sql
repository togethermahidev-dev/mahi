-- Undo 20261007295000_discard_unsent_invite. Apps that call it get an error, reported quietly;
-- an unsent link then stays in "Your invites" as before.
begin;
drop function public.discard_unsent_invite(text);
notify pgrst, 'reload schema';
commit;
