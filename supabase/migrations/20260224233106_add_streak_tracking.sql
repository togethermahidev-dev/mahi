
-- ============================================================
-- 1. Add streak columns to profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN streak_current          integer   NOT NULL DEFAULT 0,
  ADD COLUMN streak_highest          integer   NOT NULL DEFAULT 0,
  ADD COLUMN streak_lowest           integer,                        -- lowest completed non-zero streak
  ADD COLUMN streak_last_upload_date date;

-- ============================================================
-- 2. Create streak_logs table
--    Each row = one streak run (started → ended, or still active)
-- ============================================================
CREATE TABLE public.streak_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  streak_count integer     NOT NULL DEFAULT 1,
  started_at   date        NOT NULL,
  ended_at     date,                                                 -- null = still active
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX streak_logs_user_id_idx ON public.streak_logs (user_id);
CREATE INDEX streak_logs_active_idx  ON public.streak_logs (user_id, is_active) WHERE is_active = true;

-- ============================================================
-- 3. RLS on streak_logs
-- ============================================================
ALTER TABLE public.streak_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own streak history
CREATE POLICY "Users can view own streak logs"
  ON public.streak_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 4. DB function: record_upload_streak(p_user_id, p_upload_date)
--    Called server-side after every successful camera upload.
--    - Same-day upload: no-op
--    - Consecutive day (yesterday): extend streak
--    - Gap day(s): close current streak, start fresh
--    SECURITY DEFINER so it can write past RLS regardless of caller role.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_upload_streak(
  p_user_id    uuid,
  p_upload_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_date     date;
  v_current       integer;
  v_highest       integer;
  v_lowest        integer;
  v_active_log_id uuid;
  v_days_diff     integer;
BEGIN
  -- Lock the profile row to prevent concurrent streak updates
  SELECT streak_last_upload_date,
         streak_current,
         streak_highest,
         streak_lowest
  INTO   v_last_date, v_current, v_highest, v_lowest
  FROM   public.profiles
  WHERE  id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  -- Already uploaded today → idempotent no-op
  IF v_last_date = p_upload_date THEN
    RETURN jsonb_build_object(
      'streak_current', v_current,
      'streak_highest', v_highest,
      'streak_lowest',  v_lowest,
      'action',         'already_uploaded_today'
    );
  END IF;

  v_days_diff := p_upload_date - COALESCE(v_last_date, p_upload_date - 1);

  IF v_days_diff = 1 THEN
    -- ── Consecutive day: extend streak ──────────────────────────
    v_current := v_current + 1;

    IF v_current > v_highest THEN
      v_highest := v_current;
    END IF;

    -- Update the active log, or create one if somehow missing
    SELECT id INTO v_active_log_id
    FROM   public.streak_logs
    WHERE  user_id = p_user_id AND is_active = true
    LIMIT  1;

    IF v_active_log_id IS NULL THEN
      INSERT INTO public.streak_logs (user_id, streak_count, started_at, is_active)
      VALUES (p_user_id, v_current, p_upload_date, true);
    ELSE
      UPDATE public.streak_logs
      SET    streak_count = v_current
      WHERE  id = v_active_log_id;
    END IF;

  ELSE
    -- ── Gap: close current streak, start a new one ───────────────
    IF v_current > 0 THEN
      -- Track the lowest completed non-zero streak
      IF v_lowest IS NULL OR v_current < v_lowest THEN
        v_lowest := v_current;
      END IF;

      -- Close the active log
      UPDATE public.streak_logs
      SET    is_active = false,
             ended_at  = v_last_date
      WHERE  user_id   = p_user_id
        AND  is_active = true;
    END IF;

    -- Start fresh streak of 1
    v_current := 1;

    IF v_current > v_highest THEN
      v_highest := v_current;
    END IF;

    INSERT INTO public.streak_logs (user_id, streak_count, started_at, is_active)
    VALUES (p_user_id, v_current, p_upload_date, true);
  END IF;

  -- Persist updated streak state back to profile
  UPDATE public.profiles
  SET    streak_current          = v_current,
         streak_highest          = v_highest,
         streak_lowest           = v_lowest,
         streak_last_upload_date = p_upload_date,
         updated_at              = now()
  WHERE  id = p_user_id;

  RETURN jsonb_build_object(
    'streak_current', v_current,
    'streak_highest', v_highest,
    'streak_lowest',  v_lowest,
    'action',         CASE WHEN v_days_diff = 1 THEN 'extended' ELSE 'reset' END
  );
END;
$$;

-- Grant execute to authenticated users (function body runs as definer)
GRANT EXECUTE ON FUNCTION public.record_upload_streak(uuid, date) TO authenticated;
