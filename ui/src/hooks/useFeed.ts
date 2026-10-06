import { useEffect, useMemo } from 'react';
import { useFeedStore } from '@/store';
import { msLeft } from '@/lib/countdown';
import type { FeedPost } from '@/api';

export interface UseFeedResult {
  posts: FeedPost[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  /** Friends' posts are hidden until the user posts. */
  locked: boolean;
  /** When the 24-hour window from the last post ends (null = never posted). */
  unlockedUntil: string | null;
  /** server clock − device clock at the last read. */
  serverOffsetMs: number;
  /** This session's first page has arrived. */
  loaded: boolean;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * The feed, always read fresh from the server: on mount (if this session hasn't loaded it) and
 * the moment the unlock runs out. App.tsx re-reads it whenever the app comes to the foreground.
 */
export function useFeed(): UseFeedResult {
  const posts = useFeedStore((s) => s.posts);
  const pending = useFeedStore((s) => s.pending);
  const hasMore = useFeedStore((s) => s.hasMore);
  const isLoadingMore = useFeedStore((s) => s.isLoadingMore);
  const loaded = useFeedStore((s) => s.loaded);
  const error = useFeedStore((s) => s.error);
  const locked = useFeedStore((s) => s.locked);
  const unlockedUntil = useFeedStore((s) => s.unlockedUntil);
  const serverOffsetMs = useFeedStore((s) => s.serverOffsetMs);

  useEffect(() => {
    useFeedStore.getState().sync();
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
    isLoadingMore,
    locked,
    unlockedUntil,
    serverOffsetMs,
    loaded,
    loadMore: useFeedStore.getState().loadMore,
    refresh: () => useFeedStore.getState().sync(true),
  };
}
