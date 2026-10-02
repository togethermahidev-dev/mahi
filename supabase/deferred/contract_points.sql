-- NOT A MIGRATION YET (contract step for 20261002170000_mahi_points).
-- Drops the profile's computed `points` column. Since 20261002170000 it only repeats
-- streak_current (the Mahi points) for apps that still ask for it: OTA 10.25 and older read
-- profiles with select('*, points') and search with '…, streak_current, points'. The app from the
-- Mahi points release reads streak_current itself. Feed items and the tag list keep their
-- `points` field (it is the Mahi points); this file does not touch them.
--
-- When to use: once every phone has the Mahi points OTA (older updates would fail to load
-- profiles and search). If the update gate is ever raised past those builds, that is the signal.
-- How: `supabase migration new contract_points`, paste this in, write its rollback (recreate
-- public.points(public.profiles) as 20261002170000_mahi_points has it, with its grants), dry-run
-- with scripts/db.sh try, back up, push. In the same change, take the three public.points(...)
-- checks out of supabase/tests/mahi_points_test.sql (add a hasnt_function check instead).

drop function public.points(public.profiles);

notify pgrst, 'reload schema';
