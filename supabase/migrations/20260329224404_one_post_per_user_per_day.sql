
-- Step 1: Remove duplicate posts, keeping the EARLIEST post per user per calendar day (UTC).
DELETE FROM public.posts
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, (created_at AT TIME ZONE 'UTC')::date)
    id
  FROM public.posts
  ORDER BY user_id, (created_at AT TIME ZONE 'UTC')::date, created_at ASC
);

-- Step 2: Add a unique index — one post per user per UTC calendar day.
-- cast to date after converting to UTC is immutable.
CREATE UNIQUE INDEX IF NOT EXISTS posts_user_day_unique
  ON public.posts (user_id, ((created_at AT TIME ZONE 'UTC')::date));

-- Step 3: Replace INSERT RLS policy to enforce one-per-day at the DB layer.
DROP POLICY IF EXISTS posts_insert ON public.posts;
CREATE POLICY posts_insert ON public.posts
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.posts existing
      WHERE existing.user_id = auth.uid()
        AND (existing.created_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
    )
  );
