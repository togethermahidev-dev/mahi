
-- Fix profiles SELECT: drop restrictive "own only" policy, replace with "all authenticated"
-- (Feed + Messages need to read other users' profiles for avatars/usernames)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- streak_logs: add missing INSERT and UPDATE policies
CREATE POLICY "streak_logs_insert_own"
  ON public.streak_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "streak_logs_update_own"
  ON public.streak_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
