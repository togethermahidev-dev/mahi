
CREATE OR REPLACE FUNCTION public.record_upload_streak(p_user_id uuid, p_upload_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_profile     public.profiles%ROWTYPE;
  v_last        date;
  v_new_current integer;
  v_new_highest integer;
  v_new_lowest  integer;
  v_action      text;
  v_day_name    text;
  v_is_rest     boolean := false;
BEGIN
  -- Auth guard: callers can only update their own streak
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock row to prevent race condition on double-tap
  SELECT * INTO v_profile
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_last := v_profile.streak_last_upload_date::date;

  -- Idempotent: already uploaded today
  IF v_last = p_upload_date THEN
    RETURN jsonb_build_object(
      'streak_current', v_profile.streak_current,
      'streak_highest', v_profile.streak_highest,
      'streak_lowest',  v_profile.streak_lowest,
      'action',         'already_uploaded_today'
    );
  END IF;

  -- Rest day check: fitness_routine stores comma-separated full day names
  -- e.g. 'Monday,Wednesday,Friday'. Days absent from the list are rest days.
  -- to_char 'Dy' produces 3-letter abbreviations ('Mon','Tue',...) which are
  -- always a prefix/substring of the full name, so position() works correctly.
  IF v_profile.fitness_routine IS NOT NULL AND v_profile.fitness_routine <> '' THEN
    v_day_name := to_char(p_upload_date, 'Dy');
    v_is_rest  := position(v_day_name IN v_profile.fitness_routine) = 0;
  END IF;

  -- Extend: first upload, uploaded yesterday, or today is a rest day
  IF v_last IS NULL OR v_last = p_upload_date - interval '1 day' OR v_is_rest THEN
    v_new_current := v_profile.streak_current + 1;
    v_action      := 'extended';
  ELSE
    -- Missed a required day: close active log and reset
    UPDATE public.streak_logs
    SET is_active    = false,
        ended_at     = v_last,
        streak_count = v_profile.streak_current
    WHERE user_id = p_user_id AND is_active = true;
    v_new_current := 1;
    v_action      := 'reset';
  END IF;

  v_new_highest := GREATEST(v_profile.streak_highest, v_new_current);
  v_new_lowest  := CASE
    WHEN v_action = 'reset' AND v_profile.streak_current > 0
      THEN LEAST(COALESCE(v_profile.streak_lowest, v_profile.streak_current), v_profile.streak_current)
    ELSE v_profile.streak_lowest
  END;

  -- Update profile with authoritative streak values
  UPDATE public.profiles SET
    streak_current          = v_new_current,
    streak_highest          = v_new_highest,
    streak_lowest           = v_new_lowest,
    streak_last_upload_date = p_upload_date,
    updated_at              = now()
  WHERE id = p_user_id;

  -- Manage streak_logs: open new log on reset, update count on extend
  IF v_action = 'reset' THEN
    INSERT INTO public.streak_logs (user_id, streak_count, started_at, is_active)
    VALUES (p_user_id, 1, p_upload_date, true);
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.streak_logs WHERE user_id = p_user_id AND is_active = true
    ) THEN
      UPDATE public.streak_logs SET streak_count = v_new_current
      WHERE user_id = p_user_id AND is_active = true;
    ELSE
      INSERT INTO public.streak_logs (user_id, streak_count, started_at, is_active)
      VALUES (p_user_id, v_new_current, p_upload_date, true);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'streak_current', v_new_current,
    'streak_highest', v_new_highest,
    'streak_lowest',  v_new_lowest,
    'action',         v_action
  );
END;
$function$;
