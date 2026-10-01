-- Undo 20261001120200_profile_update_columns: the app may again update any column of its own
-- profile (the row rules were never changed).
begin;

revoke update on public.profiles from authenticated;
grant update on public.profiles to authenticated;

notify pgrst, 'reload schema';
commit;
