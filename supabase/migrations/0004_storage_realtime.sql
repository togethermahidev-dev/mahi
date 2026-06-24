-- STORAGE: Create public 'posts' bucket
insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict (id) do nothing;

-- STORAGE RLS: Public read access on posts bucket objects
create policy "posts_public_read"
on storage.objects
for select
to public
using (bucket_id = 'posts');

-- STORAGE RLS: Users can upload to their own folder only
create policy "posts_owner_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- STORAGE RLS: Users can delete their own files only
create policy "posts_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- REALTIME: Add conversations table with REPLICA IDENTITY FULL for UPDATE/DELETE events
alter table public.conversations replica identity full;
alter publication supabase_realtime add table public.conversations;

-- REALTIME: Add messages table with REPLICA IDENTITY FULL for UPDATE/DELETE events
alter table public.messages replica identity full;
alter publication supabase_realtime add table public.messages;

-- REALTIME: Add post_likes table for social feed subscriptions (any change triggers refetch)
alter publication supabase_realtime add table public.post_likes;

-- REALTIME: Add post_comments table for social feed subscriptions (INSERT appends to live comments)
alter publication supabase_realtime add table public.post_comments;

-- REALTIME: Add notifications table for notificationsStore subscriptions (INSERT handled by client)
alter publication supabase_realtime add table public.notifications;