
-- RPC: get follow status + counts in a single call
CREATE OR REPLACE FUNCTION public.get_follow_data(
  p_current_user_id uuid,
  p_target_user_id  uuid
)
RETURNS TABLE (
  is_following    boolean,
  follower_count  bigint,
  following_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    CASE
      WHEN p_current_user_id = p_target_user_id THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id  = p_current_user_id
          AND following_id = p_target_user_id
      )
    END AS is_following,

    (SELECT count(*) FROM public.follows
     WHERE following_id = p_target_user_id
    ) AS follower_count,

    (SELECT count(*) FROM public.follows
     WHERE follower_id = p_target_user_id
    ) AS following_count;
$$;

-- Deny all updates on follows rows
CREATE POLICY "follows_no_update"
  ON public.follows
  FOR UPDATE
  USING (false);
