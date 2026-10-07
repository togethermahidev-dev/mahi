-- Undo 20261007220000_contact_match: no finding mates from contacts. The stored hashes and the
-- tries go with their tables. Apps that call match_contacts get an error and show "Couldn’t check
-- your contacts".
begin;

drop trigger trg_profiles_contact_hashes on public.profiles;
drop trigger trg_profile_private_contact_hashes on public.profile_private;
drop function public.match_contacts(text[]);
drop function public.contact_hashes_sync();
drop function public.refresh_contact_hashes(uuid);
drop table public.contact_match_calls;
drop table public.contact_hashes;
drop function public.contact_hash(text);
drop function public.normalise_phone(text, text);
alter table public.app_config
  drop column contact_match_calls_per_hour,
  drop column contact_match_max_hashes;

notify pgrst, 'reload schema';
commit;
