
-- Ordered-participant constraint ensures one row per pair and predictable RLS.
-- Always insert with participant_one = LEAST(a,b), participant_two = GREATEST(a,b).
CREATE TABLE public.conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_one uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_two uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'requested'
                              CHECK (status IN ('requested', 'active')),
  initiated_by    uuid        NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_convo        CHECK (participant_one <> participant_two),
  CONSTRAINT ordered_participants CHECK (participant_one < participant_two)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select"
  ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = participant_one OR auth.uid() = participant_two);

CREATE POLICY "conversations_insert"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = initiated_by);

CREATE POLICY "conversations_update"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = participant_one OR auth.uid() = participant_two);

CREATE INDEX convos_p1_idx ON public.conversations (participant_one, updated_at DESC);
CREATE INDEX convos_p2_idx ON public.conversations (participant_two, updated_at DESC);
