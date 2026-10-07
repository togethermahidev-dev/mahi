-- Undo 20261007170000_username_available. Sign-up's username check then shows "Couldn't check"
-- (the app handles a missing function); the unique index still stops a taken name at sign-up.
begin;
drop function if exists public.username_available(text);
commit;
