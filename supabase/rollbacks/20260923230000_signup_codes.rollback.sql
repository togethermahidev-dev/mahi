-- Undo 20260923230000_signup_codes. First switch the rule off (Dashboard -> Authentication ->
-- Hooks -> Before User Created), or every sign-up fails once the function is gone.
-- The new send-otp / verify-otp / complete-signup need these tables, so redeploy the previous
-- functions before running this.
begin;
drop function public.hook_require_verified_signup(jsonb);
drop table public.otp_codes;
drop table public.auth_rate_limits;
delete from supabase_migrations.schema_migrations where version = '20260923230000';
commit;
