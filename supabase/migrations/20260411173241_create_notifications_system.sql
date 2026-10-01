-- Table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like','comment','follow','tag')),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id) WHERE is_read = FALSE;

-- RLS — recipient reads/updates own rows; inserts happen only via SECURITY DEFINER triggers
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);
-- No INSERT policy: only triggers write.

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
REVOKE INSERT, DELETE ON public.notifications FROM authenticated, anon;

-- Add to realtime publication (required for postgres_changes INSERT events)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger functions (all SECURITY DEFINER; all skip self-actions)
CREATE FUNCTION public.notify_on_like() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications(user_id, actor_id, type, post_id)
    VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.notify_on_comment() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications(user_id, actor_id, type, post_id, comment_id)
    VALUES (post_owner, NEW.user_id, 'comment', NEW.post_id, NEW.id);
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.notify_on_follow() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.following_id <> NEW.follower_id THEN
    INSERT INTO public.notifications(user_id, actor_id, type)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.notify_on_tag() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications(user_id, actor_id, type, post_id)
    VALUES (NEW.user_id, post_owner, 'tag', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_on_like
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

CREATE TRIGGER trg_notify_on_follow
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

CREATE TRIGGER trg_notify_on_tag
  AFTER INSERT ON public.post_tags
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_tag();
