import { useEffect, useMemo } from 'react';
import { useProfilePostsStore } from '@/store';
import { shouldResync, PROFILE_POSTS_STALE_MS } from '@/store/profilePostsStore';

/**
 * @param userId   the profile whose posts to load
 * @param isActive whether the profile panel is currently the active panel in
 *                 HorizontalNavigator. Defaults to `true` so callers that don't
 *                 thread focus (e.g. UserProfileScreen overlay) behave as before.
 */
export function useProfilePosts(userId: string, isActive: boolean = true) {
  const storeUserId = useProfilePostsStore((s) => s.userId);
  const allPosts = useProfilePostsStore((s) => s.posts);
  const hasMore = useProfilePostsStore((s) => s.hasMore);
  const isSyncing = useProfilePostsStore((s) => s.isSyncing);

  // Initial sync on mount / userId change.
  useEffect(() => {
    useProfilePostsStore.getState().sync(userId);
  }, [userId]);

  // Re-sync when this panel transitions to active AND the store is empty or
  // stale. ProfileScreen is always mounted (index 0) and never unmounts, so the
  // mount-only effect above can't recover from a raced/empty first load — this
  // focus-driven path does. Reads live state via getState() to avoid resyncing
  // on unrelated post-array changes; only `isActive`/`userId` drive it.
  useEffect(() => {
    if (!isActive) return;
    const s = useProfilePostsStore.getState();
    if (
      shouldResync({
        isActive,
        isSyncing: s.isSyncing,
        postCount: s.userId === userId ? s.posts.length : 0,
        lastSyncedAt: s.userId === userId ? s.lastSyncedAt : null,
        now: Date.now(),
        ttlMs: PROFILE_POSTS_STALE_MS,
      })
    ) {
      s.sync(userId, true);
    }
  }, [isActive, userId]);

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
