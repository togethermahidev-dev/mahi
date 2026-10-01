
CREATE TABLE public.follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follows_unique UNIQUE (follower_id, following_id),
  CONSTRAINT follows_no_self CHECK (follower_id <> following_id)
);

CREATE INDEX idx_follows_follower  ON public.follows (follower_id);
CREATE INDEX idx_follows_following ON public.follows (following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows_select" ON public.follows FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "follows_insert" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete" ON public.follows FOR DELETE USING (auth.uid() = follower_id);
