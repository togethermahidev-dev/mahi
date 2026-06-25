-- ====================================================================
-- 0006_suggested_follows.sql
-- ====================================================================
-- FUNCTION: get_suggested_follows
--
-- Suggests users for p_current_user_id to follow.
--
-- PRIMARY strategy ("follow-of-follows"): candidates are users followed
-- by the people the current user already follows. Ranked DESC by mutual
-- count = how many of the current user's followees also follow the
-- candidate (a set-based self-join + GROUP BY on follows — NOT row-by-row).
--
-- FALLBACK ("popular"): if the current user follows < 3 people (too few
-- connections for follow-of-follows to be meaningful), suggest the most-
-- followed users globally instead. The fallback applies the SAME
-- self/already-followed/blocked exclusions.
--
-- Returns ONLY public profile columns (id, username, display_name,
-- avatar_url) plus mutual_count for ranking. SECURITY DEFINER so it can
-- read the full follow graph + user_blocks; it owns authorization and
-- never leaks private profile columns.
--
-- Mirrors get_feed_posts: SECURITY DEFINER, STABLE, SET search_path = public,
-- GRANT EXECUTE TO authenticated.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_suggested_follows(
  p_current_user_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  mutual_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_follow_count int;
BEGIN
  -- How many users does the caller already follow?
  SELECT COUNT(*)::int
  INTO v_follow_count
  FROM public.follows
  WHERE follower_id = p_current_user_id;

  IF v_follow_count >= 3 THEN
    -- ----------------------------------------------------------------
    -- PRIMARY: follow-of-follows, ranked by mutual count.
    -- Set-based self-join on follows:
    --   f1 = edges OUT of the current user (the people they follow)
    --   f2 = edges OUT of those people (candidates) where f2.follower_id
    --        is one of the current user's followees.
    -- mutual_count = COUNT(DISTINCT f1.following_id) = number of the
    -- current user's followees who also follow the candidate.
    -- ----------------------------------------------------------------
    RETURN QUERY
    SELECT
      pr.id,
      pr.username,
      pr.display_name,
      pr.avatar_url,
      COUNT(DISTINCT f1.following_id)::bigint AS mutual_count
    FROM public.follows f1
    JOIN public.follows f2
      ON f2.follower_id = f1.following_id
    JOIN public.profiles pr
      ON pr.id = f2.following_id
    WHERE
      -- Only traverse out of the current user's own followees
      f1.follower_id = p_current_user_id
      -- EXCLUDE self
      AND f2.following_id <> p_current_user_id
      -- EXCLUDE anyone the current user already follows
      AND NOT EXISTS (
        SELECT 1 FROM public.follows af
        WHERE af.follower_id = p_current_user_id
          AND af.following_id = f2.following_id
      )
      -- EXCLUDE blocked: current user blocked the candidate
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = p_current_user_id
          AND ub.blocked_id = f2.following_id
      )
      -- EXCLUDE blocked: candidate blocked the current user
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = f2.following_id
          AND ub.blocked_id = p_current_user_id
      )
    GROUP BY pr.id, pr.username, pr.display_name, pr.avatar_url
    -- Stable, deterministic ordering for pagination
    ORDER BY mutual_count DESC, pr.id ASC
    LIMIT p_limit OFFSET p_offset;

  ELSE
    -- ----------------------------------------------------------------
    -- FALLBACK: most-followed (popular) users.
    -- popularity = inbound follow edges. mutual_count column reuses the
    -- popularity count so the API can rank/display uniformly.
    -- Same self/already-followed/blocked-both-directions exclusions.
    -- ----------------------------------------------------------------
    RETURN QUERY
    SELECT
      pr.id,
      pr.username,
      pr.display_name,
      pr.avatar_url,
      COUNT(fol.follower_id)::bigint AS mutual_count
    FROM public.profiles pr
    LEFT JOIN public.follows fol
      ON fol.following_id = pr.id
    WHERE
      -- EXCLUDE self
      pr.id <> p_current_user_id
      -- EXCLUDE anyone the current user already follows
      AND NOT EXISTS (
        SELECT 1 FROM public.follows af
        WHERE af.follower_id = p_current_user_id
          AND af.following_id = pr.id
      )
      -- EXCLUDE blocked: current user blocked the candidate
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = p_current_user_id
          AND ub.blocked_id = pr.id
      )
      -- EXCLUDE blocked: candidate blocked the current user
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = pr.id
          AND ub.blocked_id = p_current_user_id
      )
    GROUP BY pr.id, pr.username, pr.display_name, pr.avatar_url
    -- Stable, deterministic ordering for pagination
    ORDER BY mutual_count DESC, pr.id ASC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

-- Definer-rights RPC: grant execute to authenticated clients.
GRANT EXECUTE ON FUNCTION public.get_suggested_follows(uuid, int, int) TO authenticated;

-- Suggestions are a signed-in feature. Postgres grants EXECUTE to PUBLIC by
-- default, which would let the anon role call this SECURITY DEFINER function;
-- revoke that so only the explicit authenticated grant above remains. (Clears
-- the anon_security_definer_function_executable advisor.)
REVOKE EXECUTE ON FUNCTION public.get_suggested_follows(uuid, int, int) FROM public, anon;
