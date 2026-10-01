import { create } from 'zustand';
import { getUserPosts, type ProfilePostCursor } from '@/api';
import type { Database } from '@/types';

type PostRow = Database['public']['Tables']['posts']['Row'];

const PAGE_SIZE = 30;

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
  posts: PostRow[];
  cursor: ProfilePostCursor | undefined;
  hasMore: boolean;
  isSyncing: boolean;
  // Timestamp (ms) of the last successful sync, used for staleness checks.
  lastSyncedAt: number | null;

  sync: (userId: string, force?: boolean) => Promise<void>;
  loadMore: (userId: string) => Promise<void>;
  addPost: (post: PostRow) => void;
  reset: () => void;
}

export const useProfilePostsStore = create<ProfilePostsState>((set, get) => ({
  userId: null,
  posts: [],
  cursor: undefined,
  hasMore: true,
  isSyncing: false,
  lastSyncedAt: null,

  sync: async (userId, force = false) => {
    const { isSyncing, posts, userId: currentUserId } = get();
    // If the userId changed, clear stale data and force a fresh fetch
    if (currentUserId !== userId) {
      set({ userId, posts: [], cursor: undefined, hasMore: true, lastSyncedAt: null });
      force = true;
    }
    // Concurrency guard only — never block on `posts.length > 0` when the store
    // is EMPTY, otherwise a raced/empty first load could never recover. Skip a
    // redundant fetch only when we already have posts and the caller isn't
    // forcing (e.g. a stale-driven re-sync passes force=true).
    if (isSyncing || (!force && posts.length > 0)) return;
    set({ isSyncing: true, userId });

    const { data, error } = await getUserPosts(userId, PAGE_SIZE);
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
      const hasMore = data.length === 0 ? true : data.length === PAGE_SIZE;
      set({ posts: data, cursor, hasMore, lastSyncedAt: Date.now() });
    } else if (error) {
      console.log(`[profilePostsStore] sync error userId=${userId}`, error);
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
    }
    set({ isSyncing: false });
  },

  addPost: (post) =>
    set((s) => {
      // Enforce one post per day in the local store — drop any existing entry
      // for the same UTC calendar day before prepending the new one.
      const postDay = new Date(post.created_at).toISOString().slice(0, 10);
      const deduped = s.posts.filter(
        (p) => new Date(p.created_at).toISOString().slice(0, 10) !== postDay
      );
      return { posts: [post, ...deduped] };
    }),

  reset: () =>
    set({
      userId: null,
      posts: [],
      cursor: undefined,
      hasMore: true,
      isSyncing: false,
      lastSyncedAt: null,
    }),
}));
