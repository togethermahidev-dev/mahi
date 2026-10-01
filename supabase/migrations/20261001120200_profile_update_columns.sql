-- Only the server changes a profile's streak, ban, username and id (security review, 2026-10-01).
-- "Users can update own profile" limits the app to its own row but not to columns, so a person
-- could set their own streak_current, streak_highest, is_banned, username or id. Column grants
-- close that: the app keeps the columns it writes today (checked against src/ on 2026-10-01:
-- avatar_url and timezone from src/api/profile.ts, plus the sign-up details) and nothing else.
-- The row rules are unchanged. Server functions (create_post, break_missed_streaks) run as their
-- owner and edge functions use the service role, so neither is affected.
-- Test: supabase/tests/profile_update_columns_test.sql

revoke update on public.profiles from anon, authenticated;
grant update (display_name, first_name, last_name, date_of_birth, contact_number, fitness_goals,
              avatar_url, timezone)
  on public.profiles to authenticated;

notify pgrst, 'reload schema';
