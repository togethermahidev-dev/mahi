-- ====================================================================
-- FUNCTION: toggle_like
-- ====================================================================
-- Atomic like toggle: insert if not liked, delete if already liked.
-- Returns the final state (liked: boolean, like_count: bigint).
-- SECURITY DEFINER guards p_user_id = auth.uid().

CREATE OR REPLACE FUNCTION public.toggle_like(
  p_post_id uuid,
  p_user_id uuid
)
RETURNS TABLE (liked boolean, like_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liked boolean;
  v_count bigint;
BEGIN
  -- Auth guard
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: user_id does not match auth.uid()';
  END IF;

  -- Atomic toggle: delete the like if it exists, otherwise insert it.
  -- (`ON CONFLICT ... DO DELETE` is NOT valid Postgres — must delete-then-insert.)
  DELETE FROM public.post_likes
  WHERE post_id = p_post_id AND user_id = p_user_id;

  IF FOUND THEN
    v_liked := false;
  ELSE
    INSERT INTO public.post_likes (post_id, user_id)
    VALUES (p_post_id, p_user_id);
    v_liked := true;
  END IF;

  -- Get the authoritative like count for this post
  SELECT COUNT(*)::bigint INTO v_count
  FROM public.post_likes
  WHERE post_id = p_post_id;

  RETURN QUERY SELECT v_liked, v_count;
END;
$$;

-- ====================================================================
-- FUNCTION: get_feed_posts
-- ====================================================================
-- Replaces old posts table select + FEED_SELECT constant.
-- Returns enriched feed rows with like_count, comment_count, liked_by_me,
-- and tagged_users (jsonb array of {user_id, username, display_name, avatar_url}).
-- Cursor pagination on (created_at DESC, id DESC).
-- Excludes posts from users the caller has blocked or who blocked the caller.

CREATE OR REPLACE FUNCTION public.get_feed_posts(
  p_limit int,
  p_cursor_ts timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  image_url text,
  pov_image_url text,
  caption text,
  streak_day int,
  created_at timestamptz,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean,
  tagged_users jsonb,
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.image_url,
    p.pov_image_url,
    p.caption,
    p.streak_day,
    p.created_at,
    COALESCE((SELECT COUNT(*)::bigint FROM public.post_likes WHERE post_id = p.id), 0),
    COALESCE((SELECT COUNT(*)::bigint FROM public.post_comments WHERE post_id = p.id), 0),
    EXISTS(SELECT 1 FROM public.post_likes WHERE post_id = p.id AND user_id = auth.uid()),
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', pt.user_id,
          'username', tp.username,
          'display_name', tp.display_name,
          'avatar_url', tp.avatar_url
        )
        ORDER BY tp.username
      )
      FROM public.post_tags pt
      JOIN public.profiles tp ON pt.user_id = tp.id
      WHERE pt.post_id = p.id),
      '[]'::jsonb
    ),
    pr.id,
    pr.username,
    pr.display_name,
    pr.avatar_url
  FROM public.posts p
  JOIN public.profiles pr ON p.user_id = pr.id
  WHERE
    -- Exclude posts from users I have blocked
    NOT EXISTS(
      SELECT 1 FROM public.user_blocks
      WHERE blocker_id = auth.uid() AND blocked_id = p.user_id
    )
    AND
    -- Exclude posts from users who have blocked me
    NOT EXISTS(
      SELECT 1 FROM public.user_blocks
      WHERE blocker_id = p.user_id AND blocked_id = auth.uid()
    )
    AND
    -- Cursor pagination: (created_at DESC, id DESC)
    (
      p_cursor_ts IS NULL
      OR (p.created_at, p.id) < (p_cursor_ts, p_cursor_id)
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit;
END;
$$;

-- ====================================================================
-- FUNCTION: record_upload_streak
-- ====================================================================
-- Authoritative streak counter with rest-day logic.
-- Auth-guarded: rejects calls where p_user_id <> auth.uid().
-- Uses SELECT ... FOR UPDATE to prevent double-tap race conditions.
-- Idempotent: same-day calls return current values without incrementing.
-- Rest-day logic: reads profiles.fitness_routine (comma-separated full day names),
-- uses to_char(p_upload_date, 'Dy') to check membership.
-- Returns { streak_current, streak_highest, streak_lowest, action }.

CREATE OR REPLACE FUNCTION public.record_upload_streak(
  p_user_id uuid,
  p_upload_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upload_date date;
  v_last_upload_date date;
  v_fitness_routine text;
  v_day_abbr text;
  v_is_training_day boolean;
  v_is_rest_day boolean;
  v_days_since_last_upload int;
  v_streak_current int;
  v_streak_highest int;
  v_streak_lowest int;
  v_active_log_id uuid;
  v_action text;
BEGIN
  -- Auth guard
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: p_user_id does not match auth.uid()';
  END IF;

  -- Default to today's date if not provided (caller should pass local date)
  v_upload_date := COALESCE(p_upload_date, CURRENT_DATE);

  -- Lock the profile row to prevent concurrent updates.
  -- NOTE: do NOT select `id` here — it must not overwrite v_upload_date (a date)
  -- with the profile's uuid (which would both error and clobber the computed date).
  SELECT
    fitness_routine,
    streak_current,
    streak_highest,
    streak_lowest,
    streak_last_upload_date
  INTO
    v_fitness_routine,
    v_streak_current,
    v_streak_highest,
    v_streak_lowest,
    v_last_upload_date
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Handle first-ever upload or reset
  IF v_last_upload_date IS NULL THEN
    v_streak_current := 1;
    v_streak_highest := 1;
    v_streak_lowest := NULL;
    v_action := 'start';

    -- Create initial streak log
    INSERT INTO public.streak_logs (user_id, started_at, streak_count, is_active)
    VALUES (p_user_id, v_upload_date, 1, true)
    ON CONFLICT DO NOTHING;

    -- Update profile
    UPDATE public.profiles
    SET
      streak_current = v_streak_current,
      streak_highest = v_streak_highest,
      streak_last_upload_date = v_upload_date,
      updated_at = now()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'streak_current', v_streak_current,
      'streak_highest', v_streak_highest,
      'streak_lowest', v_streak_lowest,
      'action', v_action
    );
  END IF;

  -- Idempotent: same-day call
  IF v_last_upload_date = v_upload_date THEN
    v_action := 'idle';
    RETURN jsonb_build_object(
      'streak_current', v_streak_current,
      'streak_highest', v_streak_highest,
      'streak_lowest', v_streak_lowest,
      'action', v_action
    );
  END IF;

  -- Determine if today is a training day or rest day
  v_day_abbr := to_char(v_upload_date, 'Dy');
  v_is_training_day := v_fitness_routine IS NOT NULL AND POSITION(v_day_abbr IN v_fitness_routine) > 0;
  v_is_rest_day := v_fitness_routine IS NOT NULL AND v_day_abbr != 'Dy' AND POSITION(v_day_abbr IN v_fitness_routine) = 0;

  v_days_since_last_upload := v_upload_date - v_last_upload_date;

  -- Consecutive day or rest day: extend the streak
  IF (v_days_since_last_upload = 1) OR (v_days_since_last_upload > 1 AND v_is_rest_day) THEN
    v_streak_current := v_streak_current + 1;
    v_action := 'extend';

    -- Update highest
    IF v_streak_current > v_streak_highest THEN
      v_streak_highest := v_streak_current;
    END IF;

    -- Update active streak log count
    UPDATE public.streak_logs
    SET streak_count = v_streak_current
    WHERE user_id = p_user_id AND is_active = true;

  ELSE
    -- Non-consecutive training day or missed multiple days: reset
    v_streak_current := 1;
    v_action := 'reset';

    -- Close active streak log
    UPDATE public.streak_logs
    SET is_active = false, ended_at = CURRENT_DATE
    WHERE user_id = p_user_id AND is_active = true;

    -- Track lowest
    SELECT COUNT(*) INTO v_streak_lowest FROM public.streak_logs
    WHERE user_id = p_user_id AND is_active = false;

    -- Create new active streak log
    INSERT INTO public.streak_logs (user_id, started_at, streak_count, is_active)
    VALUES (p_user_id, v_upload_date, 1, true);

  END IF;

  -- Update profile with authoritative streak values
  UPDATE public.profiles
  SET
    streak_current = v_streak_current,
    streak_highest = v_streak_highest,
    streak_lowest = COALESCE(v_streak_lowest, streak_lowest),
    streak_last_upload_date = v_upload_date,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'streak_current', v_streak_current,
    'streak_highest', v_streak_highest,
    'streak_lowest', v_streak_lowest,
    'action', v_action
  );
END;
$$;

-- ====================================================================
-- FUNCTION: get_follow_data
-- ====================================================================
-- Returns follow status (is_following) and follower/following counts.
-- is_following uses EXISTS (index-only probe) — returns false when viewing own profile.
-- Called from src/api/follows.ts:getFollowData.

CREATE OR REPLACE FUNCTION public.get_follow_data(
  p_current_user_id uuid,
  p_target_user_id uuid
)
RETURNS TABLE (
  is_following boolean,
  follower_count bigint,
  following_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (CASE WHEN p_current_user_id = p_target_user_id THEN false
          ELSE EXISTS(
            SELECT 1 FROM public.follows
            WHERE follower_id = p_current_user_id AND following_id = p_target_user_id
          )
     END) AS is_following,
    (SELECT COUNT(*)::bigint FROM public.follows WHERE following_id = p_target_user_id) AS follower_count,
    (SELECT COUNT(*)::bigint FROM public.follows WHERE follower_id = p_target_user_id) AS following_count;
END;
$$;

-- ====================================================================
-- TRIGGER FUNCTION: update_conversations_updated_at
-- ====================================================================
-- Sets conversations.updated_at = now() on messages INSERT.

CREATE OR REPLACE FUNCTION public.update_conversations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_update_conversations_on_message_insert ON public.messages;
CREATE TRIGGER trigger_update_conversations_on_message_insert
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversations_updated_at();

-- ====================================================================
-- TRIGGER FUNCTION: on_user_block
-- ====================================================================
-- AFTER INSERT on user_blocks:
-- 1. Delete mutual follows between blocker and blocked.
-- 2. Set shared conversations status to 'blocked' (or delete them if app prefers).
-- Per blockStore.ts comment: "the DB trigger already removed follows + hid conversations"

CREATE OR REPLACE FUNCTION public.on_user_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Remove follows in both directions between blocker and blocked
  DELETE FROM public.follows
  WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);

  -- Set shared conversations to blocked status
  UPDATE public.conversations
  SET status = 'blocked'
  WHERE (participant_one = NEW.blocker_id AND participant_two = NEW.blocked_id)
     OR (participant_one = NEW.blocked_id AND participant_two = NEW.blocker_id);

  RETURN NEW;
END;
$$;

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_user_block_cascade ON public.user_blocks;
CREATE TRIGGER trigger_user_block_cascade
AFTER INSERT ON public.user_blocks
FOR EACH ROW
EXECUTE FUNCTION public.on_user_block();