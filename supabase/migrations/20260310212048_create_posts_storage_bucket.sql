
-- Create storage bucket for post images (private — access controlled via RLS)
INSERT INTO storage.buckets (id, name, public)
VALUES ('posts', 'posts', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload only to their own folder: posts/{user_id}/*
CREATE POLICY "posts_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'posts'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

-- All authenticated users can read post images (social feed)
CREATE POLICY "posts_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'posts');

-- Users can only delete their own uploads
CREATE POLICY "posts_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'posts'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
