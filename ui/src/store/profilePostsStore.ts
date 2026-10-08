import { create } from 'zustand';
import { getUserPosts, type FeedPost, type ProfilePostCursor } from '@/api';
import { reportError } from '@/lib/sentry';
import type { ProfileRestriction } from '@/lib/accountControls';

// A profile grid loads four workouts at a time: enough to complete two rows without over-fetching.
const PAGE_SIZE = 4;

// How long a successful sync stays "fresh" before a focus-driven re-sync is
// allowed. Keeps swiping back to profile from re-fetching on every gesture
// while still recovering from a raced/empty first load.
export const PROFILE_POSTS_STALE_MS = 30_000;

/**
 * Pure predicate: should the profile-posts store re-sync when the panel
 * becomes active? Re-sync only when the store is EMPTY (e.g. a raced first
 * load returned nothing) or STALE (last successful sync older than `ttlMs`).
 * Never re-sync while a sync is already in flight.
 *
 * Kept pure (no store/RN deps) so it is unit-testable in a node environment.
 */
export function shouldResync(args: {
  isActive: boolean;
  isSyncing: boolean;
  postCount: number;
  lastSyncedAt: number | null;
  now: number;
  ttlMs: number;
}): boolean {
  const { isActive, isSyncing, postCount, lastSyncedAt, now, ttlMs } = args;
  if (!isActive || isSyncing) return false;
  if (postCount === 0) return true;
  if (lastSyncedAt === null) return true;
  return now - lastSyncedAt >= ttlMs;
}

interface ProfilePostsState {
  userId: string | null;
  /** Posts as the feed shows them (counts, tags, poster), so the post viewer can show them too. */
  posts: FeedPost[];
  cursor: ProfilePostCursor | undefined;
  hasMore: boolean;
  isSyncing: boolean;
  // Timestamp (ms) of the last successful sync, used for staleness checks.
  lastSyncedAt: number | null;
  /** Their Controls hide their workouts from you (private accounts); null when you can see them. */
  restricted: ProfileRestriction | null;

  sync: (userId: string, force?: boolean) => Promise<void>;
  loadMore: (userId: string) => Promise<void>;
  addPost: (post: FeedPost) => void;
  /** Like and comment counts changed (socialStore keeps them in step with the feed's). */
  patchPost: (id: string, partial: Partial<FeedPost>) => void;
  removePost: (id: string) => void;
  reset: () => void;
}

export const useProfilePostsStore = create<ProfilePostsState>((set, get) => ({
  userId: null,
  posts: [],
  cursor: undefined,
  hasMore: true,
  isSyncing: false,
  lastSyncedAt: null,
  restricted: null,

  sync: async (userId, force = false) => {
    const { isSyncing, posts, userId: currentUserId } = get();
    // If the userId changed, clear stale data and force a fresh fetch
    if (currentUserId !== userId) {
      set({
        userId,
        posts: [],
        cursor: undefined,
        hasMore: true,
        lastSyncedAt: null,
        restricted: null,
      });
      force = true;
    }
    // Concurrency guard only — never block on `posts.length > 0` when the store
    // is EMPTY, otherwise a raced/empty first load could never recover. Skip a
    // redundant fetch only when we already have posts and the caller isn't
    // forcing (e.g. a stale-driven re-sync passes force=true).
    if (isSyncing || (!force && posts.length > 0)) return;
    set({ isSyncing: true, userId });

    const { data, error, restricted = null } = await getUserPosts(userId, PAGE_SIZE);
    if (!error && data) {
      // Only apply if this is still the active userId (avoid race conditions)
      if (get().userId !== userId) {
        set({ isSyncing: false });
        return;
      }
      const cursor: ProfilePostCursor | undefined = data.length
        ? { ts: data.at(-1)!.created_at, id: data.at(-1)!.id }
        : undefined;
      // An empty result keeps hasMore=true so a later focus can re-sync and
      // recover; a full page means more may exist; a short page means done.
      // A hidden grid has nothing more to load.
      const hasMore = restricted ? false : data.length === 0 ? true : data.length === PAGE_SIZE;
      set({ posts: data, cursor, hasMore, lastSyncedAt: Date.now(), restricted });
    } else if (error) {
      console.log(`[profilePostsStore] sync error userId=${userId}`, error);
      reportError(error, {
        flow: 'profile',
        action: 'loadPosts',
        extra: { userId, rpc: 'get_user_posts' },
      });
    }
    set({ isSyncing: false });
  },

  loadMore: async (userId) => {
    const { isSyncing, hasMore, cursor, posts, userId: currentUserId } = get();
    if (isSyncing || !hasMore || currentUserId !== userId) return;
    set({ isSyncing: true });

    const { data, error } = await getUserPosts(userId, PAGE_SIZE, cursor);
    if (!error && data) {
      if (get().userId !== userId) {
        set({ isSyncing: false });
        return;
      }
      set({
        posts: [...posts, ...data],
        cursor: data.length ? { ts: data.at(-1)!.created_at, id: data.at(-1)!.id } : cursor,
        hasMore: data.length === PAGE_SIZE,
      });
    } else if (error) {
      reportError(error, {
        flow: 'profile',
        action: 'loadMorePosts',
        extra: { userId, loaded: posts.length, rpc: 'get_user_posts' },
      });
    }
    set({ isSyncing: false });
  },

  addPost: (post) =>
    // No daily limit: only a retry of the same post replaces it.
    set((s) => ({ posts: [post, ...s.posts.filter((p) => p.id !== post.id)] })),

  patchPost: (id, partial) =>
    set((s) => ({ posts: s.posts.map((p) => (p.id === id ? { ...p, ...partial } : p)) })),

  removePost: (id) => set((s) => ({ posts: s.posts.filter((post) => post.id !== id) })),

  reset: () =>
    set({
      userId: null,
      posts: [],
      cursor: undefined,
      hasMore: true,
      isSyncing: false,
      lastSyncedAt: null,
      restricted: null,
    }),
}));
