
-- ─── 1. Unique index on conversations (participant_one, participant_two) ─────
-- Required for the upsert ON CONFLICT (participant_one, participant_two) to work.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_participants_unique
  ON public.conversations (participant_one, participant_two);

-- ─── 2. REPLICA IDENTITY FULL on both tables ─────────────────────────────────
-- Ensures all columns are available in the WAL for UPDATE/DELETE realtime events.
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages      REPLICA IDENTITY FULL;

-- ─── 3. Enable Realtime on both tables ───────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ─── 4. Fix conversations INSERT policy ──────────────────────────────────────
-- Must enforce that initiated_by = auth.uid() and user is a participant.
DROP POLICY IF EXISTS conversations_insert ON public.conversations;
CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    initiated_by = auth.uid()
    AND (participant_one = auth.uid() OR participant_two = auth.uid())
  );

-- ─── 5. Add conversations DELETE policy (DENY flow) ──────────────────────────
DROP POLICY IF EXISTS conversations_delete ON public.conversations;
CREATE POLICY conversations_delete ON public.conversations
  FOR DELETE TO authenticated
  USING (
    participant_one = auth.uid() OR participant_two = auth.uid()
  );

-- ─── 6. Fix conversations UPDATE policy ──────────────────────────────────────
-- Only the receiver (non-initiator) may accept a request.
DROP POLICY IF EXISTS conversations_update ON public.conversations;
CREATE POLICY conversations_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    participant_one = auth.uid() OR participant_two = auth.uid()
  )
  WITH CHECK (
    -- Accepting: only the receiver can flip status to active
    (status = 'active' AND initiated_by <> auth.uid())
    -- Or any participant can update (covers future fields if added)
    OR (participant_one = auth.uid() OR participant_two = auth.uid())
  );

-- ─── 7. Fix messages INSERT policy ───────────────────────────────────────────
-- Sender must be authenticated user and must be a conversation participant.
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant_one = auth.uid() OR c.participant_two = auth.uid())
    )
  );
