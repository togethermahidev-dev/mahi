-- get_suggested_follows (roadmap 5.1). Follow-of-follows ranked by mutual count,
-- with a popularity fallback for users with < 3 connections. Both branches
-- exclude self, already-followed, and blocked users in BOTH directions, and
-- return ONLY public profile columns. SECURITY DEFINER so it can read the full
-- follow graph + user_blocks; it owns authorization and never leaks private columns.
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
  SELECT COUNT(*)::int
  INTO v_follow_count
  FROM public.follows
  WHERE follower_id = p_current_user_id;

  IF v_follow_count >= 3 THEN
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
      f1.follower_id = p_current_user_id
      AND f2.following_id <> p_current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.follows af
        WHERE af.follower_id = p_current_user_id
          AND af.following_id = f2.following_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = p_current_user_id
          AND ub.blocked_id = f2.following_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = f2.following_id
          AND ub.blocked_id = p_current_user_id
      )
    GROUP BY pr.id, pr.username, pr.display_name, pr.avatar_url
    ORDER BY mutual_count DESC, pr.id ASC
    LIMIT p_limit OFFSET p_offset;

  ELSE
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
      pr.id <> p_current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.follows af
        WHERE af.follower_id = p_current_user_id
          AND af.following_id = pr.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = p_current_user_id
          AND ub.blocked_id = pr.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = pr.id
          AND ub.blocked_id = p_current_user_id
      )
    GROUP BY pr.id, pr.username, pr.display_name, pr.avatar_url
    ORDER BY mutual_count DESC, pr.id ASC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_suggested_follows(uuid, int, int) TO authenticated;
