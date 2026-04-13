import { useEffect } from 'react';
import { useProfilePostsStore } from '@/store';

export function useProfilePosts(userId: string) {
  const posts     = useProfilePostsStore((s) => s.posts);
  const hasMore   = useProfilePostsStore((s) => s.hasMore);
  const isSyncing = useProfilePostsStore((s) => s.isSyncing);

  useEffect(() => {
    useProfilePostsStore.getState().sync(userId);
  }, [userId]);

  return {
    posts,
    isLoading: isSyncing && posts.length === 0,
    hasMore,
    loadMore: () => useProfilePostsStore.getState().loadMore(userId),
    refresh:  () => useProfilePostsStore.getState().sync(userId, true),
  };
}
