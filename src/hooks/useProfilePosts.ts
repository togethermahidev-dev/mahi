import { useEffect, useMemo } from 'react';
import { useProfilePostsStore } from '@/store';

export function useProfilePosts(userId: string) {
  const storeUserId = useProfilePostsStore((s) => s.userId);
  const allPosts = useProfilePostsStore((s) => s.posts);
  const hasMore = useProfilePostsStore((s) => s.hasMore);
  const isSyncing = useProfilePostsStore((s) => s.isSyncing);

  useEffect(() => {
    useProfilePostsStore.getState().sync(userId);
  }, [userId]);

  // Only return posts that belong to the requested userId.
  // The store is a singleton shared across ProfileScreen and UserProfileScreen,
  // so stale posts from a previously-viewed user can linger until sync completes.
  const posts = useMemo(
    () => (storeUserId === userId ? allPosts : []),
    [allPosts, storeUserId, userId]
  );

  return {
    posts,
    isLoading: isSyncing && posts.length === 0,
    hasMore,
    loadMore: () => useProfilePostsStore.getState().loadMore(userId),
    refresh: () => useProfilePostsStore.getState().sync(userId, true),
  };
}
