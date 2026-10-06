-- Undo 20261006130000_private_details: date of birth and phone number go back onto profiles
-- (readable by every signed-in person again, as before).
begin;

drop trigger trg_profiles_move_private_details on public.profiles;
drop function public.profiles_move_private_details();

alter table public.profiles disable trigger trg_profiles_updated_at;
update public.profiles p
set date_of_birth = v.date_of_birth, contact_number = v.contact_number
from public.profile_private v
where v.id = p.id;
alter table public.profiles enable trigger trg_profiles_updated_at;

drop function public.my_private_details();
drop table public.profile_private;

notify pgrst, 'reload schema';
commit;
