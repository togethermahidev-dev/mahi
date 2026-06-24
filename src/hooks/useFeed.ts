import { useEffect, useMemo } from 'react';
import { useFeedStore } from '@/store';
import type { FeedPost } from '@/api';

export interface UseFeedResult {
  posts: FeedPost[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

export function useFeed(): UseFeedResult {
  const posts = useFeedStore((s) => s.posts);
  const pending = useFeedStore((s) => s.pending);
  const hasMore = useFeedStore((s) => s.hasMore);
  const isSyncing = useFeedStore((s) => s.isSyncing);
  const error = useFeedStore((s) => s.error);

  // Sync on first mount only if store is empty (App.tsx may have pre-populated it)
  useEffect(() => {
    if (posts.length === 0 && pending.length === 0 && !isSyncing) {
      useFeedStore.getState().sync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPosts = useMemo(() => [...pending, ...posts] as FeedPost[], [pending, posts]);

  return {
    posts: allPosts,
    // Only show loading state on a truly empty store — never after first hydration
    isLoading: isSyncing && allPosts.length === 0,
    error,
    hasMore,
    loadMore: useFeedStore.getState().loadMore,
    refresh: () => useFeedStore.getState().sync(true),
  };
}
