import { useEffect, useRef } from 'react';
import { useProfilePostsStore } from '@/store';

export function useProfilePosts(userId: string) {
  const posts     = useProfilePostsStore((s) => s.posts);
  const hasMore   = useProfilePostsStore((s) => s.hasMore);
  const isSyncing = useProfilePostsStore((s) => s.isSyncing);

  // useRef guard prevents double-sync if the component re-mounts or two
  // instances mount simultaneously (store's isSyncing check is a secondary guard).
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      useProfilePostsStore.getState().sync(userId);
    }
  }, [userId]);

  return {
    posts,
    isLoading: isSyncing && posts.length === 0,
    hasMore,
    loadMore: () => useProfilePostsStore.getState().loadMore(userId),
    refresh:  () => useProfilePostsStore.getState().sync(userId, true),
  };
}
