import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { useFeedStore } from '@/store';
import { msLeft } from '@/lib/countdown';
import type { FeedPost } from '@/api';

export interface UseFeedResult {
  posts: FeedPost[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  /** Friends' posts are hidden until the user posts. */
  locked: boolean;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * The feed, always read fresh from the server: on mount (if this session hasn't loaded it),
 * whenever the app comes back to the foreground, and the moment the unlock runs out.
 */
export function useFeed(): UseFeedResult {
  const posts = useFeedStore((s) => s.posts);
  const pending = useFeedStore((s) => s.pending);
  const hasMore = useFeedStore((s) => s.hasMore);
  const loaded = useFeedStore((s) => s.loaded);
  const error = useFeedStore((s) => s.error);
  const locked = useFeedStore((s) => s.locked);
  const unlockedUntil = useFeedStore((s) => s.unlockedUntil);
  const serverOffsetMs = useFeedStore((s) => s.serverOffsetMs);

  useEffect(() => {
    useFeedStore.getState().sync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') useFeedStore.getState().sync(true);
    });
    return () => sub.remove();
  }, []);

  // Re-read when the unlock ends so friends' photos disappear on time.
  useEffect(() => {
    if (locked || !unlockedUntil) return;
    const ms = msLeft(unlockedUntil, serverOffsetMs);
    const id = setTimeout(() => useFeedStore.getState().sync(true), ms + 1000);
    return () => clearTimeout(id);
  }, [locked, unlockedUntil, serverOffsetMs]);

  const allPosts = useMemo(() => [...pending, ...posts] as FeedPost[], [pending, posts]);

  return {
    posts: allPosts,
    // Loading until this session's first page arrives — never shows last session's posts.
    isLoading: !loaded && allPosts.length === 0,
    error,
    hasMore,
    locked,
    loadMore: useFeedStore.getState().loadMore,
    refresh: () => useFeedStore.getState().sync(true),
  };
}
