-- Enable Row-Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- profiles: SELECT to all authenticated; INSERT/UPDATE own only (auth.uid() = id)
-- ============================================================================
CREATE POLICY "Profiles: SELECT all authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Profiles: INSERT own only"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles: UPDATE own only"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- posts: SELECT authenticated read-all; INSERT own only + same-day duplicate block;
-- no UPDATE; DELETE own only
-- ============================================================================
CREATE POLICY "Posts: SELECT all authenticated"
  ON public.posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Posts: INSERT own only with same-day check"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.user_id = auth.uid()
        AND (p.created_at AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    )
  );

CREATE POLICY "Posts: DELETE own only"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- post_likes: authenticated read-all; insert/delete own only (auth.uid() = user_id)
-- ============================================================================
CREATE POLICY "Post likes: SELECT all authenticated"
  ON public.post_likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Post likes: INSERT own only"
  ON public.post_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Post likes: DELETE own only"
  ON public.post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- post_comments: authenticated read-all; insert/delete own only
-- ============================================================================
CREATE POLICY "Post comments: SELECT all authenticated"
  ON public.post_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Post comments: INSERT own only"
  ON public.post_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Post comments: DELETE own only"
  ON public.post_comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- follows: authenticated read-all; insert/delete own only (auth.uid() = follower_id);
-- explicit UPDATE deny using (false)
-- ============================================================================
CREATE POLICY "Follows: SELECT all authenticated"
  ON public.follows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Follows: INSERT own only"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Follows: DELETE own only"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

CREATE POLICY "Follows: UPDATE explicitly denied"
  ON public.follows FOR UPDATE
  TO authenticated
  USING (false);

-- ============================================================================
-- post_tags: SELECT using(true); INSERT only when caller owns the parent post;
-- no UPDATE/DELETE policies (immutable v1)
-- ============================================================================
CREATE POLICY "Post tags: SELECT all"
  ON public.post_tags FOR SELECT
  USING (true);

CREATE POLICY "Post tags: INSERT only for own posts"
  ON public.post_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_id AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- conversations: SELECT/INSERT/UPDATE limited to participants
-- (auth.uid() in (participant_one, participant_two)); initiated_by = auth.uid() on insert
-- ============================================================================
CREATE POLICY "Conversations: SELECT only as participant"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    auth.uid() = participant_one OR auth.uid() = participant_two
  );

CREATE POLICY "Conversations: INSERT as participant with auth check"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = participant_one OR auth.uid() = participant_two)
    AND auth.uid() = initiated_by
  );

CREATE POLICY "Conversations: UPDATE only as participant"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = participant_one OR auth.uid() = participant_two
  )
  WITH CHECK (
    auth.uid() = participant_one OR auth.uid() = participant_two
  );

-- DELETE needed by the deny-request flow (messages.ts deleteConversation).
-- messages cascade-delete via the FK ON DELETE CASCADE in 0001_schema.sql.
CREATE POLICY "Conversations: DELETE only as participant"
  ON public.conversations FOR DELETE
  TO authenticated
  USING (
    auth.uid() = participant_one OR auth.uid() = participant_two
  );

-- ============================================================================
-- messages: SELECT to conversation participants; INSERT only by sender who is participant;
-- immutable (no UPDATE/DELETE)
-- ============================================================================
CREATE POLICY "Messages: SELECT only as conversation participant"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.participant_one = auth.uid() OR c.participant_two = auth.uid())
    )
  );

CREATE POLICY "Messages: INSERT only as sender participant"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.participant_one = auth.uid() OR c.participant_two = auth.uid())
    )
  );

-- ============================================================================
-- streak_logs: SELECT own only; writes happen via SECURITY DEFINER RPC
-- so no direct INSERT/UPDATE/DELETE policies for authenticated clients
-- ============================================================================
CREATE POLICY "Streak logs: SELECT own only"
  ON public.streak_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- notifications: SELECT/UPDATE own only (auth.uid() = user_id) for is_read;
-- INSERT performed by triggers/SECURITY DEFINER functions, so no direct client INSERT
-- ============================================================================
CREATE POLICY "Notifications: SELECT own only"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Notifications: UPDATE is_read own only"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- user_blocks: SELECT/INSERT/DELETE own only (auth.uid() = blocker_id)
-- ============================================================================
CREATE POLICY "User blocks: SELECT own blocks"
  ON public.user_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "User blocks: INSERT own blocks only"
  ON public.user_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "User blocks: DELETE own blocks only"
  ON public.user_blocks FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

-- ============================================================================
-- user_reports: INSERT own only (auth.uid() = reporter_id);
-- SELECT none for authenticated clients (moderation-only, service_role reads)
-- ============================================================================
CREATE POLICY "User reports: INSERT own only"
  ON public.user_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- ============================================================================
-- otp_codes: RLS enabled; explicit block-all policies for anon/authenticated.
-- The service_role key (used by the send-otp / complete-signup Edge Functions)
-- bypasses RLS entirely, so it retains full access. These policies make the
-- "no client access" intent explicit. (This is the ONLY place otp_codes RLS is
-- configured — the tables migration intentionally omits it.)
-- ============================================================================
CREATE POLICY "block_all_reads" ON public.otp_codes FOR SELECT USING (false);
CREATE POLICY "block_all_inserts" ON public.otp_codes FOR INSERT WITH CHECK (false);
CREATE POLICY "block_all_updates" ON public.otp_codes FOR UPDATE USING (false);
CREATE POLICY "block_all_deletes" ON public.otp_codes FOR DELETE USING (false);
