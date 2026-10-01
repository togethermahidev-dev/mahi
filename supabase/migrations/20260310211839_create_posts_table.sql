
CREATE TABLE public.posts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url   text        NOT NULL,
  caption     text,
  streak_day  integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_select"
  ON public.posts FOR SELECT TO authenticated USING (true);

CREATE POLICY "posts_insert"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "posts_update"
  ON public.posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "posts_delete"
  ON public.posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX posts_created_at_idx    ON public.posts (created_at DESC);
CREATE INDEX posts_user_id_time_idx  ON public.posts (user_id, created_at DESC);
