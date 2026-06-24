import { create } from 'zustand';
import { getUserPosts, type ProfilePostCursor } from '@/api';
import type { Database } from '@/types';

type PostRow = Database['public']['Tables']['posts']['Row'];

const PAGE_SIZE = 30;

interface ProfilePostsState {
  userId: string | null;
  posts: PostRow[];
  cursor: ProfilePostCursor | undefined;
  hasMore: boolean;
  isSyncing: boolean;

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

  sync: async (userId, force = false) => {
    const { isSyncing, posts, userId: currentUserId } = get();
    // If the userId changed, clear stale data and force a fresh fetch
    if (currentUserId !== userId) {
      set({ userId, posts: [], cursor: undefined, hasMore: true });
      force = true;
    }
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
      set({ posts: data, cursor, hasMore: data.length === PAGE_SIZE });
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

  reset: () => set({ userId: null, posts: [], cursor: undefined, hasMore: true, isSyncing: false }),
}));
